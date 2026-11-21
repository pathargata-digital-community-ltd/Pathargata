import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { update, ref } from "firebase/database";
import { useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { notificationSummary, useInAppNotificationBanner, type AppNotification } from "@/hooks/use-notifications";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { playAppSound } from "@/lib/app-sounds";

const DISMISS_AFTER_MS = 4_000;

function iconFor(type: string) {
  if (type === "like") return "heart" as const;
  if (["comment", "reply", "chat"].includes(type)) return "chatbubble" as const;
  if (type === "blood_req") return "water" as const;
  if (["market_order", "market_order_update"].includes(type)) return "bag-handle" as const;
  return "notifications" as const;
}

function openNotification(item: AppNotification) {
  const activeUid = pathargataAuth.currentUser?.uid;
  if (activeUid) {
    void update(ref(pathargataDb, `notifications/${activeUid}/${item.id}`), { read: true }).catch(() => undefined);
  }
  if (item.postId) {
    router.push({ pathname: "/post/[id]" as any, params: { id: item.postId } });
  } else if (item.type === "chat" && item.fromUid) {
    router.push({ pathname: "/messages", params: { uid: item.fromUid, name: item.fromName || "User" } });
  } else if (item.type === "blood_req") {
    router.push({ pathname: "/service/blood" as any, params: { requestId: item.bloodRequestId || item.requestId || "" } });
  } else {
    router.push("/notifications" as any);
  }
}

export function InAppNotificationBanner() {
  const insets = useSafeAreaInsets();
  const { notification, dismiss } = useInAppNotificationBanner();
  const [visible, setVisible] = useState(false);
  const shownIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!notification || shownIdRef.current === notification.id) return;
    shownIdRef.current = notification.id;
    setVisible(true);
    playAppSound(notification.type === "chat" ? "message" : "notification", notification.fromUid);
    const timer = setTimeout(() => {
      setVisible(false);
      dismiss();
    }, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [dismiss, notification]);

  if (!visible || !notification) return null;
  const title = notification.fromName || (notification.type === "blood_req" ? "জরুরি আপডেট" : "পাথরঘাটা ডিজিটাল");
  const body = notificationSummary(notification);
  const top = Math.max(insets.top, Platform.OS === "web" ? 10 : 12);

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top, left: 12, right: 12, zIndex: 2400, elevation: 24 }}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={`${title}: ${body}`}
        onPress={() => { setVisible(false); dismiss(); openNotification(notification); }}
        style={({ pressed }) => ({
          minHeight: 68,
          borderRadius: 18,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#D8E8DD",
          shadowColor: "#09251B",
          shadowOpacity: 0.16,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          opacity: pressed ? 0.88 : 1,
        })}
      >
        {notification.fromPhoto ? (
          <Image source={{ uri: notification.fromPhoto }} style={{ width: 44, height: 44, borderRadius: 14 }} />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: "#E8F5EC", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={iconFor(notification.type)} size={22} color="#15803D" />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
          <Text numberOfLines={1} style={{ color: "#17382C", fontSize: 13, fontWeight: "800" }}>{title}</Text>
          <Text numberOfLines={2} style={{ marginTop: 2, color: "#52645A", fontSize: 12, lineHeight: 17 }}>{body}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="নোটিফিকেশন বন্ধ করুন" hitSlop={10} onPress={() => { setVisible(false); dismiss(); }}>
          <Ionicons name="close" size={19} color="#718078" />
        </Pressable>
      </Pressable>
    </View>
  );
}
