import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { onAuthStateChanged } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { subscribeFirebaseAppCheckStatus, type FirebaseAppCheckStatus } from "@/lib/firebase-app-check";
import { useRemoteControls } from "@/hooks/use-remote-controls";

type MaintenanceRecord = {
  enabled?: boolean;
  message?: string;
};

export function GlobalAppStatus() {
  const { emergency } = useRemoteControls();
  const [networkOnline, setNetworkOnline] = useState<boolean | null>(null);
  const [offlineConfirmed, setOfflineConfirmed] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [appCheckStatus, setAppCheckStatus] = useState<FirebaseAppCheckStatus>("idle");

  useEffect(() => subscribeFirebaseAppCheckStatus(setAppCheckStatus), []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const updateBrowserStatus = () => setNetworkOnline(window.navigator.onLine);
      updateBrowserStatus();
      window.addEventListener("online", updateBrowserStatus);
      window.addEventListener("offline", updateBrowserStatus);
      return () => {
        window.removeEventListener("online", updateBrowserStatus);
        window.removeEventListener("offline", updateBrowserStatus);
      };
    }

    let active = true;
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (active) setNetworkOnline(state.isConnected === true && state.isInternetReachable !== false);
      })
      .catch(() => {
        if (active) setNetworkOnline(null);
      });
    const subscription = Network.addNetworkStateListener((state) => {
      if (active) setNetworkOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // Do not infer device internet from Firebase RTDB. Firebase can reconnect
    // or be blocked by App Check while the device is still online.
    const offlineSignal = networkOnline === false;
    if (!offlineSignal) {
      const timer = setTimeout(() => setOfflineConfirmed(false), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setOfflineConfirmed(true), 1800);
    return () => clearTimeout(timer);
  }, [networkOnline]);

  useEffect(() => {
    return onValue(
      ref(pathargataDb, "admin_settings/app_maintenance"),
      (snapshot) => {
        const value = snapshot.val();
        setMaintenance(value && typeof value === "object" ? value as MaintenanceRecord : null);
      },
      () => setMaintenance(null),
    );
  }, []);

  useEffect(() => {
    let active = true;
    let authVersion = 0;
    const authUnsubscribe = onAuthStateChanged(pathargataAuth, (user) => {
      const version = ++authVersion;
      setIsAdmin(false);
      if (!user) return;

      void user.getIdTokenResult().then((token) => {
        if (active && version === authVersion) setIsAdmin(token.claims.admin === true);
      }).catch(() => {
        if (active && version === authVersion) setIsAdmin(false);
      });
    });

    return () => {
      active = false;
      authVersion += 1;
      authUnsubscribe();
    };
  }, []);

  const showOfflineWarning = offlineConfirmed && networkOnline === false;
  const showMaintenance = (maintenance?.enabled === true || emergency.maintenance) && !isAdmin;
  const showReadOnly = emergency.readOnly;
  const showAppCheckWarning = appCheckStatus === "failed";
  const maintenanceMessage = typeof maintenance?.message === "string" && maintenance.message.trim()
    ? maintenance.message.trim()
    : "পাথরঘাটা ডিজিটাল অ্যাপটি সাময়িক রক্ষণাবেক্ষণের জন্য বন্ধ আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";

  if (showMaintenance) {
    return (
      <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 3000, elevation: 30, backgroundColor: "#F5FBF7", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}>
        <View style={{ width: 82, height: 82, borderRadius: 28, backgroundColor: "#E6F3EA", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="construct-outline" size={39} color="#15803D" />
        </View>
        <Text style={{ marginTop: 24, color: "#0B2D26", fontSize: 23, fontWeight: "800", textAlign: "center" }}>
          অ্যাপ সাময়িকভাবে বন্ধ
        </Text>
        <Text style={{ marginTop: 12, color: "#52645A", fontSize: 15, lineHeight: 23, textAlign: "center" }}>
          {maintenanceMessage}
        </Text>
        {networkOnline === false ? (
          <Text style={{ marginTop: 20, color: "#9A3412", fontSize: 13, fontWeight: "700", textAlign: "center" }}>
            ইন্টারনেট সংযোগও পাওয়া যাচ্ছে না।
          </Text>
        ) : null}
        <Text style={{ marginTop: 30, color: "#718078", fontSize: 12, textAlign: "center" }}>
          পাথরঘাটা ডিজিটাল · সংযোগ ফিরে এলে এই বার্তাটি নিজে থেকেই সরে যাবে।
        </Text>
      </View>
    );
  }

  if (showReadOnly) {
    return (
      <View accessibilityRole="alert" style={{ position: "absolute", top: Platform.OS === "web" ? 8 : 50, left: 12, right: 12, zIndex: 2500, elevation: 20, minHeight: 48, borderRadius: 16, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="lock-closed-outline" size={20} color="#C2410C" />
        <Text style={{ marginLeft: 9, flex: 1, color: "#9A3412", fontSize: 13, fontWeight: "700", lineHeight: 19 }}>জরুরি read-only mode চালু আছে। নতুন post, message বা upload সাময়িকভাবে বন্ধ।</Text>
      </View>
    );
  }

  if (showAppCheckWarning) {
    return (
      <View
        accessibilityRole="alert"
        style={{ position: "absolute", top: Platform.OS === "web" ? 8 : 50, left: 12, right: 12, zIndex: 2500, elevation: 20, minHeight: 48, borderRadius: 16, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center" }}
      >
        <Ionicons name="shield-outline" size={20} color="#C2410C" />
        <Text style={{ marginLeft: 9, flex: 1, color: "#9A3412", fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
          নিরাপত্তা যাচাই সম্পন্ন হয়নি। অ্যাপটি চালু আছে, তবে কিছু Firebase action সাময়িকভাবে ব্যর্থ হতে পারে। নতুন build বা internet connection যাচাই করুন।
        </Text>
      </View>
    );
  }

  if (!showOfflineWarning) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{ position: "absolute", top: Platform.OS === "web" ? 8 : 50, left: 12, right: 12, zIndex: 2500, elevation: 20, minHeight: 48, borderRadius: 16, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center" }}
    >
      <Ionicons name="cloud-offline-outline" size={20} color="#C2410C" />
      <Text style={{ marginLeft: 9, flex: 1, color: "#9A3412", fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
        ইন্টারনেট সংযোগ নেই। সংরক্ষিত তথ্য দেখা যেতে পারে; নতুন তথ্য পাঠাতে ইন্টারনেট চালু করুন। সংযোগ ফিরে এলে এই বার্তাটি নিজে থেকেই সরে যাবে।
      </Text>
    </View>
  );
}
