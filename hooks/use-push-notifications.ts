import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { ref, remove, set } from "firebase/database";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { playAppSound } from "@/lib/app-sounds";
import { useRemoteControls } from "@/hooks/use-remote-controls";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // Native foreground notifications use the bundled effect below; keep Web's
    // existing Expo notification sound behavior unchanged.
    shouldPlaySound: Platform.OS === "web",
    shouldSetBadge: false,
  }),
});

type PushData = {
  notificationId?: string;
  type?: string;
  postId?: string;
  fromUid?: string;
  fromName?: string;
  bloodRequestId?: string;
  requestId?: string;
};

function tokenKey(token: string) {
  // RTDB keys cannot contain dots or brackets; encodeURIComponent handles the
  // bracketed Expo token, and the explicit replacement covers its unescaped dot.
  return encodeURIComponent(token).replace(/\./g, "%2E");
}

export function usePushNotifications(enabled: boolean) {
  const { flags, emergency } = useRemoteControls();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(
    () => pathargataAuth.currentUser?.uid ?? null,
  );

  useEffect(
    () =>
      onAuthStateChanged(pathargataAuth, (user) => {
        setUid(user?.uid ?? null);
      }),
    [],
  );

  useEffect(() => {
    if (!enabled || !flags.pushNotifications || emergency.readOnly || !uid || Platform.OS === "web") return;

    let cancelled = false;
    const registeredKeys = new Set<string>();
    const handledResponses = new Set<string>();

    const registerExpoToken = async () => {
      if (cancelled) return;
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "সাধারণ নোটিফিকেশন",
            importance: Notifications.AndroidImportance.MAX,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            showBadge: true,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#15803D",
          });
        }

        const currentPermission = await Notifications.getPermissionsAsync();
        let permissionStatus = currentPermission.status;
        if (permissionStatus !== "granted") {
          const requestedPermission =
            await Notifications.requestPermissionsAsync();
          permissionStatus = requestedPermission.status;
        }
        if (permissionStatus !== "granted" || cancelled) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        if (!projectId) {
          console.warn("Push registration skipped: EAS project ID is missing.");
          return;
        }

        const expoToken = (
          await Notifications.getExpoPushTokenAsync({ projectId })
        ).data;
        if (cancelled) return;

        const key = tokenKey(expoToken);
        const tokenRef = ref(
          pathargataDb,
          `pushTokens/${uid}/${key}`,
        );
        await set(tokenRef, {
          token: expoToken,
          platform: Platform.OS,
          updatedAt: Date.now(),
        });
        if (cancelled) {
          await remove(tokenRef).catch(() => undefined);
          return;
        }

        registeredKeys.add(key);
        for (const oldKey of [...registeredKeys]) {
          if (oldKey === key) continue;
          await remove(
            ref(pathargataDb, `pushTokens/${uid}/${oldKey}`),
          ).catch(() => undefined);
          registeredKeys.delete(oldKey);
        }
      } catch {
        // The in-app notification list remains available if permission, network,
        // push credentials, or Firebase token storage is temporarily unavailable.
        console.warn("Push notification registration could not be completed.");
      }
    };

    const handleNotificationResponse = (
      response: Notifications.NotificationResponse,
    ) => {
      const responseId = response.notification.request.identifier;
      if (handledResponses.has(responseId)) return;
      handledResponses.add(responseId);

      const data = response.notification.request.content.data as PushData;
      const activeUid = pathargataAuth.currentUser?.uid;
      if (activeUid && data.notificationId) {
        void set(
          ref(
            pathargataDb,
            `notifications/${activeUid}/${data.notificationId}/read`,
          ),
          true,
        ).catch(() => undefined);
      }

      if (data.postId) {
        router.push({
          pathname: "/post/[id]" as any,
          params: { id: data.postId },
        });
      } else if (data.type === "blood_req") {
        const requestId = data.bloodRequestId || data.requestId;
        if (requestId) {
          router.push({
            pathname: "/service/blood" as any,
            params: { requestId },
          });
        } else {
          router.push("/service/blood" as any);
        }
      } else if (data.type === "chat" && data.fromUid) {
        router.push({
          pathname: "/messages",
          params: { uid: data.fromUid, name: data.fromName || "User" },
        });
      } else if (data.notificationId) {
        router.push("/notifications" as any);
      }
    };

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );
    const soundSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data as PushData;
        const type = String(data.type || "").toLowerCase();
        const isMessage = type.includes("chat") || type.includes("message");
        playAppSound(isMessage ? "message" : "notification", data.fromUid);
      },
    );
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void registerExpoToken();
    });

    void registerExpoToken();
    void Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        if (!cancelled && response) {
          handleNotificationResponse(response);
          await Notifications.clearLastNotificationResponseAsync();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      responseSubscription.remove();
      soundSubscription.remove();
      tokenSubscription.remove();
      for (const key of registeredKeys) {
        void remove(ref(pathargataDb, `pushTokens/${uid}/${key}`)).catch(
          () => undefined,
        );
      }
    };
  }, [enabled, emergency.readOnly, flags.pushNotifications, router, uid]);
}
