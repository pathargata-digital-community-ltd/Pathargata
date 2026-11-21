import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Image, Platform, Text, View } from "react-native";
import Constants from "expo-constants";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { onAuthStateChanged, onIdTokenChanged } from "firebase/auth";
import { get, onDisconnect, onValue, ref, serverTimestamp, set } from "firebase/database";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import {
  initManusRuntime,
  subscribeSafeAreaInsets,
} from "@/lib/_core/manus-runtime";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { isLocalAreaVerified } from "@/lib/local-area-unlock";
import { clearLegacySavedLogins } from "@/lib/legacy-saved-login-cleanup";
import { ensureNativeFirebaseAppCheck } from "@/lib/firebase-app-check";
import { clearUserScopedLocalCache, setRtdbCacheUser } from "@/lib/rtdb-cache";
import { authFailure } from "@/lib/safe-logger";
import { installWebAlertOverride } from "@/lib/web-alert-override";
import { syncAppSoundPreferences } from "@/lib/app-sounds";
import { ensureChatKeyPair } from "@/lib/chat-crypto";
import { GlobalAppStatus } from "@/components/global-app-status";
import { InAppNotificationBanner } from "@/components/in-app-notification-banner";

setRtdbCacheUser(pathargataAuth.currentUser?.uid ?? null);
installWebAlertOverride();

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };
const isAppCheckDebugBuild = __DEV__ || Constants.expoConfig?.extra?.appCheckProvider === "debug";

function BrandSplash({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setVisible(false), 700);
    return () => clearTimeout(timer);
  }, [ready]);
  if (!visible) return null;
  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: "#F5FBF7", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ marginBottom: 10, color: "#0B2D26", fontSize: 16, fontWeight: "800" }}>পাথরঘাটা ডিজিটাল</Text>
      <Image source={require("@/assets/images/pathargata-original-logo.png")} style={{ width: 64, height: 64 }} resizeMode="contain" />
      <View style={{ alignItems: "center", marginTop: 12, gap: 8 }}>
        <ActivityIndicator size="small" color="#15803D" />
        <Text style={{ color: "#64756A", fontSize: 14, fontWeight: "600" }}>লোড হচ্ছে...</Text>
      </View>
      <View style={{ position: "absolute", left: 20, right: 20, bottom: 32, alignItems: "center" }}>
        <Text style={{ color: "#52645A", fontSize: 15, fontWeight: "600", textAlign: "center" }}>পাথরঘাটা ডিজিটাল কমিউনিটি লিমিটেড</Text>
      </View>
    </View>
  );
}

function AppCheckStatus({ onRetry }: { onRetry: () => void }) {
  if (isAppCheckDebugBuild) {
    return <View accessibilityRole="alert" style={{ position: "absolute", top: Platform.OS === "web" ? 8 : 50, left: 12, right: 12, zIndex: 2600, elevation: 25, minHeight: 48, borderRadius: 16, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center" }}><Text style={{ flex: 1, color: "#9A3412", fontSize: 13, fontWeight: "700", lineHeight: 19 }}>Test build-এর App Check token যাচাই হয়নি। Firebase Debug token register করুন; অ্যাপ ব্যবহার চালিয়ে যেতে পারবেন।</Text><Text onPress={onRetry} accessibilityRole="button" style={{ marginLeft: 10, color: "#C2410C", fontSize: 13, fontWeight: "900" }}>আবার চেষ্টা</Text></View>;
  }
  return <View accessibilityRole="alert" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 2900, elevation: 29, backgroundColor: "#F5FBF7", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}><View style={{ width: 76, height: 76, borderRadius: 25, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#B91C1C", fontSize: 30, fontWeight: "900" }}>!</Text></View><Text style={{ marginTop: 22, color: "#0B2D26", fontSize: 22, fontWeight: "800", textAlign: "center" }}>নিরাপদ সংযোগ যাচাই হয়নি</Text><Text style={{ marginTop: 12, color: "#52645A", fontSize: 15, lineHeight: 23, textAlign: "center" }}>এই release build-এর নিরাপত্তা যাচাই সম্পন্ন হয়নি। ইন্টারনেট ও Google Play Services পরীক্ষা করে আবার চেষ্টা করুন।</Text><Text onPress={onRetry} accessibilityRole="button" style={{ marginTop: 24, borderRadius: 14, backgroundColor: "#15803D", color: "#FFFFFF", paddingHorizontal: 18, paddingVertical: 12, fontSize: 15, fontWeight: "800" }}>আবার চেষ্টা করুন</Text></View>;
}

function PresenceTracker() {
  useEffect(() => {
    let connectedUnsubscribe: (() => void) | undefined;
    let disconnectRef: ReturnType<typeof ref> | undefined;
    const authUnsubscribe = onAuthStateChanged(pathargataAuth, (user) => {
      connectedUnsubscribe?.();
      if (disconnectRef) void set(disconnectRef, { state: "offline", last_changed: serverTimestamp() }).catch(() => undefined);
      if (!user) { connectedUnsubscribe = undefined; disconnectRef = undefined; return; }
      void ensureChatKeyPair(user.uid).catch(() => undefined);
      const statusRef = ref(pathargataDb, `status/${user.uid}`);
      disconnectRef = statusRef;
      connectedUnsubscribe = onValue(ref(pathargataDb, ".info/connected"), (snapshot) => {
        if (snapshot.val() !== true) return;
        void onDisconnect(statusRef).set({ state: "offline", last_changed: serverTimestamp() }).then(() =>
          set(statusRef, { state: "online", last_changed: serverTimestamp() }),
        ).catch(() => undefined);
      });
    });
    return () => {
      authUnsubscribe();
      connectedUnsubscribe?.();
      if (disconnectRef) void set(disconnectRef, { state: "offline", last_changed: serverTimestamp() }).catch(() => undefined);
    };
  }, []);
  return null;
}

export const unstable_settings = {
  anchor: "(tabs)",
};

function AuthGate({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  const router = useRouter();
  const segments = useSegments();
  // Never redirect Web users until Firebase reports its restored initial session.
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(
    Boolean(pathargataAuth.currentUser),
  );
  const [currentUid, setCurrentUid] = useState<string | null>(
    pathargataAuth.currentUser?.uid ?? null,
  );
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "locked">("checking");
  usePushNotifications(authReady && authenticated);

  useEffect(() => {
    let active = true;
    let observedUid: string | null = null;
    const unsubscribe = onIdTokenChanged(pathargataAuth, (user) => {
      if (!active) return;
      const nextUid = user?.uid ?? null;
      const switchedAccount = observedUid !== null && observedUid !== nextUid;
      if (observedUid && observedUid !== nextUid) {
        void clearUserScopedLocalCache(observedUid);
      }
      observedUid = nextUid;
      if (switchedAccount) {
        setAuthenticated(false);
        setAuthReady(false);
        setAccessState("checking");
      }
      setCurrentUid(nextUid);
      if (nextUid) setAccessState("checking");
      setRtdbCacheUser(observedUid);
      if (!user) {
        syncAppSoundPreferences(null);
        setAuthenticated(false);
        setAccessState("allowed");
        setAuthReady(true);
        return;
      }
      void (async () => {
        let locked = false;
        try {
          const snapshot = await get(ref(pathargataDb, `users/${user.uid}`));
          const profile = snapshot.val() || {};
          syncAppSoundPreferences(profile.settings);
          const approvedByAdmin = profile.accountAccess === "approved" || profile.accessReview === "approved" || isLocalAreaVerified(user.uid);
          locked = profile.status === "deactivated" || (!approvedByAdmin && (profile.accountAccess === "locked" || profile.status === "pending_review" || profile.status === "locked"));
        } catch {
          // Auth remains available if profile-status reads are temporarily offline.
        }
        if (!active || observedUid !== user.uid) return;
        setAuthenticated(true);
        setAccessState(locked ? "locked" : "allowed");
        setAuthReady(true);
      })();
    }, (error) => {
      if (!active) return;
      authFailure("auth_state_observer_failed", error);
      setAuthenticated(false);
      setCurrentUid(null);
      setAccessState("allowed");
      setAuthReady(true);
    });
    // Native keeps its established recovery fallback. Web waits for Firebase's
    // initial callback to avoid redirecting a persisted user to the login screen.
    const timeout = Platform.OS === "web" ? null : setTimeout(() => {
      if (active) setAuthReady(true);
    }, 5000);
    return () => {
      active = false;
      unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!authenticated || !currentUid) return;
    return onValue(ref(pathargataDb, `users/${currentUid}`), (snapshot) => {
      const profile = snapshot.val() || {};
      syncAppSoundPreferences(profile.settings);
      const approvedByAdmin = profile.accountAccess === "approved" || profile.accessReview === "approved" || isLocalAreaVerified(currentUid);
      const locked = profile.status === "deactivated" || (!approvedByAdmin && (profile.accountAccess === "locked" || profile.status === "pending_review" || profile.status === "locked"));
      setAccessState(locked ? "locked" : "allowed");
    });
  }, [authenticated, currentUid]);

  useEffect(() => {
    if (authReady) onReady();
  }, [authReady, onReady]);

  useEffect(() => {
    if (!authReady) return;
    const firstSegment = segments[0];
    const isPublicRoute = firstSegment === "auth" || firstSegment === "oauth";
    const isApprovalRoute = String(firstSegment) === "area-approval";
    if (!authenticated && !isPublicRoute) router.replace("/auth");
    if (authenticated && accessState === "locked" && !isApprovalRoute) router.replace("/area-approval" as any);
    if (authenticated && accessState === "allowed" && (firstSegment === "auth" || isApprovalRoute)) router.replace("/(tabs)");
  }, [accessState, authReady, authenticated, router, segments]);

  if (!authReady) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#15803D" />
        <Text className="text-sm text-muted mt-3">সেশন যাচাই হচ্ছে...</Text>
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  const [appReady, setAppReady] = useState(false);
  const [appCheckFailed, setAppCheckFailed] = useState(false);
  const [appCheckAttempt, setAppCheckAttempt] = useState(0);
  const handleAppReady = useCallback(() => setAppReady(true), []);

  useEffect(() => {
    void clearLegacySavedLogins().catch((error) => {
      authFailure("legacy_saved_password_cleanup_failed", error);
    });
  }, []);

  useEffect(() => {
    void ensureNativeFirebaseAppCheck()
      .then(() => setAppCheckFailed(false))
      .catch((error) => {
        setAppCheckFailed(true);
        authFailure("app_check_initialization_failed", error);
      });
  }, [appCheckAttempt]);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? {
      insets: initialInsets,
      frame: initialFrame,
    };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PresenceTracker />
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthGate onReady={handleAppReady}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="area-approval" />
              <Stack.Screen name="compose" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="emergency" />
              <Stack.Screen name="post/[id]" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="service/directory" />
              <Stack.Screen name="verification" />
              <Stack.Screen name="invite" />
              <Stack.Screen name="oauth/callback" />
            </Stack>
          </AuthGate>
          <InAppNotificationBanner />
          <GlobalAppStatus />
          {Platform.OS !== "web" && appCheckFailed ? <AppCheckStatus onRetry={() => setAppCheckAttempt((value) => value + 1)} /> : null}
          <BrandSplash ready={appReady} />
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>
        {content}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
