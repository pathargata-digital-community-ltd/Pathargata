import { safeGoBack } from "@/lib/safe-navigation";
import {
  clearUserScopedLocalCache,
  clearRtdbSnapshotCache,
  getWithCache,
  invalidateRtdbSnapshotCache,
  onValueWithCache as onValue,
} from "@/lib/rtdb-cache";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
} from "firebase/auth";
import { get, ref, remove, set, update } from "firebase/database";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import {
  compareAppVersions,
  normalizeAppVersion,
  safeHttpsUrl,
} from "@/lib/app-version";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { syncAppSoundPreferences } from "@/lib/app-sounds";
import { setDataSaverPreference } from "@/lib/data-saver";
import { useThemeContext } from "@/lib/theme-provider";
import { syncClientPublicProfileIndex } from "@/lib/public-profile-index";

type SettingState = {
  privacy_hide_contact: boolean;
  showOnline: boolean;
  masterPush: boolean;
  bloodAlert: boolean;
  marketAlert: boolean;
  messageAlert: boolean;
  messagePrivacy: "everyone" | "friends" | "requests";
  readReceipts: boolean;
  postAlert: boolean;
  tagPermission: "everyone" | "friends" | "none";
  profileVisibility: "everyone" | "none";
};
const defaults: SettingState = {
  privacy_hide_contact: false,
  showOnline: true,
  masterPush: true,
  bloodAlert: true,
  marketAlert: true,
  messageAlert: true,
  messagePrivacy: "everyone",
  readReceipts: false,
  postAlert: true,
  tagPermission: "everyone",
  profileVisibility: "none",
};
export default function SettingsScreen() {
  const user = pathargataAuth.currentUser;
  const { colorScheme, setColorScheme } = useThemeContext();
  const [settings, setSettings] = useState<SettingState>(defaults);
  const [profileSummary, setProfileSummary] = useState({ name: "", phone: "", photo: "" });
  const [fontSize, setFontSize] = useState("normal");
  const [dataSaver, setDataSaver] = useState(false);
  const [message, setMessage] = useState("");
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordResetSending, setPasswordResetSending] = useState(false);
  const [passwordResetCooldown, setPasswordResetCooldown] = useState(0);
  const [blockedModalVisible, setBlockedModalVisible] = useState(false);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<
    { uid: string; name: string; photo: string }[]
  >([]);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  useEffect(() => {
    if (passwordResetCooldown <= 0) return;
    const timer = setTimeout(() => setPasswordResetCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [passwordResetCooldown]);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      void getWithCache<Record<string, unknown>>(
        ref(pathargataDb, `users/${user.uid}`),
      ).then(({ value: cachedOrFresh }) => {
        if (!active) return;
        const value = (cachedOrFresh || {}) as Record<string, unknown>;
        const loadedSettings = {
          ...defaults,
          ...((value.settings || {}) as Partial<SettingState>),
          privacy_hide_contact: Boolean(
            value.privacy_hide_contact || value.hide_phone,
          ),
        };
        setSettings(loadedSettings);
        syncAppSoundPreferences(loadedSettings);
        setProfileSummary({
          name: typeof value.name === "string" ? value.name : user.displayName || "",
          phone: typeof value.phone === "string" ? value.phone : "",
          photo:
            typeof value.profile_pic === "string" && value.profile_pic
              ? value.profile_pic
              : user.photoURL || "",
        });
      });
      void AsyncStorage.multiGet([
        "pathargata-font-size",
        "pathargata-data-saver",
      ]).then(([font, saver]) => {
        if (!active) return;
        if (font[1]) setFontSize(font[1]);
        if (saver[1]) setDataSaver(saver[1] === "true");
      });
      return () => {
        active = false;
      };
    }, [user]),
  );
  useFocusEffect(
    useCallback(() => {
      if (!user || !blockedModalVisible) return;
      let active = true;
      const paths = [
        `users/${user.uid}/blocked_users`,
        `user_blocks/${user.uid}`,
      ];
      const sourceIds = new Map(paths.map((path) => [path, [] as string[]]));
      async function refreshBlockedUsers() {
        const ids = [...new Set([...sourceIds.values()].flat())];
        try {
          const rows = await Promise.all(
            ids.map(async (uid) => {
              const { value: cachedOrFresh } = await getWithCache<
                Record<string, unknown>
              >(ref(pathargataDb, `users/${uid}`));
              const value = cachedOrFresh || {};
              return {
                uid,
                name:
                  typeof value.name === "string"
                    ? value.name
                    : typeof value.displayName === "string"
                      ? value.displayName
                      : "অজ্ঞাত ব্যবহারকারী",
                photo:
                  typeof value.profile_pic === "string"
                    ? value.profile_pic
                    : typeof value.photoURL === "string"
                      ? value.photoURL
                      : "",
              };
            }),
          );
          if (active) setBlockedUsers(rows);
        } catch {
          if (active) setMessage("Blocked users-এর তথ্য লোড করা যায়নি।");
        } finally {
          if (active) setBlockedLoading(false);
        }
      }

      const unsubscribers = paths.map((path) =>
        onValue(
          ref(pathargataDb, path),
          (snapshot) => {
            sourceIds.set(path, Object.keys(snapshot.val() || {}));
            void refreshBlockedUsers();
          },
          () => {
            if (active) {
              setMessage("Blocked users-এর তথ্য লোড করা যায়নি।");
              setBlockedLoading(false);
            }
          },
        ),
      );
      return () => {
        active = false;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    }, [user, blockedModalVisible]),
  );
  async function updateSetting<K extends keyof SettingState>(
    key: K,
    value: SettingState[K],
  ) {
    if (!user) return;
    const previous = settings[key];
    const nextSettings = { ...settings, [key]: value };
    setSettings((current) => ({ ...current, [key]: value }));
    if (key === "masterPush" || key === "messageAlert" || key === "postAlert") {
      syncAppSoundPreferences(nextSettings);
    }
    try {
      await update(ref(pathargataDb, `users/${user.uid}/settings`), {
        [key]: value,
      });
      const savedSetting = await get(
        ref(pathargataDb, `users/${user.uid}/settings/${String(key)}`),
      );
      if (savedSetting.val() !== value) {
        throw new Error("সেটিংস Firebase-এ verify করা যায়নি");
      }
      if (key === "privacy_hide_contact")
        await update(ref(pathargataDb, `users/${user.uid}`), {
          privacy_hide_contact: value,
          hide_phone: value,
        });
      let projectionSyncFailed = false;
      if (key === "profileVisibility") {
        try {
          const profileSnapshot = await get(ref(pathargataDb, `users/${user.uid}`));
          await syncClientPublicProfileIndex(
            user.uid,
            (profileSnapshot.val() || {}) as Record<string, unknown>,
            value,
          );
        } catch {
          // The setting is already saved. Keep it visible even if the new
          // self-managed projection rule has not reached production yet.
          projectionSyncFailed = true;
        }
      }
      await invalidateRtdbSnapshotCache([`users/${user.uid}`, `people_index/${user.uid}`]);
      setMessage(
        projectionSyncFailed
          ? "Public setting সংরক্ষণ হয়েছে। Directory sync-এর জন্য Firebase Rules update প্রয়োজন।"
          : "সেটিংস সংরক্ষণ হয়েছে।",
      );
    } catch (error) {
      setSettings((current) => ({ ...current, [key]: previous }));
      if (key === "masterPush" || key === "messageAlert" || key === "postAlert") {
        syncAppSoundPreferences(settings);
      }
      setMessage(error instanceof Error ? error.message : "সেটিংস সংরক্ষণ হয়নি। আবার চেষ্টা করুন।");
    }
  }
  async function changeFontSize(value: string) {
    const previous = fontSize;
    setFontSize(value);
    try {
      await AsyncStorage.setItem("pathargata-font-size", value);
      setMessage("লেখার আকার সংরক্ষণ হয়েছে।");
    } catch {
      setFontSize(previous);
      setMessage("লেখার আকার সংরক্ষণ হয়নি। আবার চেষ্টা করুন।");
    }
  }
  async function changeDataSaver(value: boolean) {
    const previous = dataSaver;
    setDataSaver(value);
    try {
      await setDataSaverPreference(value);
      setMessage(value ? "ডেটা সেভার চালু হয়েছে। ছবি ও media কম data ব্যবহার করবে।" : "ডেটা সেভার বন্ধ হয়েছে।");
    } catch {
      setDataSaver(previous);
      setMessage("ডেটা সেভারের পছন্দ সংরক্ষণ হয়নি। আবার চেষ্টা করুন।");
    }
  }
  async function changeTheme(isDark: boolean) {
    const nextScheme = isDark ? "dark" : "light";
    setColorScheme(nextScheme);
    try {
      await AsyncStorage.setItem("pathargata-theme", nextScheme);
      setMessage("থিমের পছন্দ সংরক্ষণ হয়েছে।");
    } catch {
      setMessage("থিমের পছন্দ এই ডিভাইসে সংরক্ষণ হয়নি।");
    }
  }
  async function clearCache() {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      await Promise.all([
        AsyncStorage.removeItem("pathargata-native-feed-v1"),
        user ? clearUserScopedLocalCache(user.uid) : clearRtdbSnapshotCache(),
      ]);
      setMessage("অস্থায়ী ক্যাশ পরিষ্কার হয়েছে। অ্যাকাউন্টের তথ্য মুছে যায়নি।");
    } catch {
      setMessage("ক্যাশ পরিষ্কার করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setClearingCache(false);
    }
  }
  async function checkForNativeUpdate() {
    if (checkingVersion) return;
    setCheckingVersion(true);
    setMessage("Native App-এর update তথ্য যাচাই হচ্ছে...");
    try {
      const installedVersion = normalizeAppVersion(
        Constants.expoConfig?.version,
      );
      if (!installedVersion) {
        setMessage("এই build-এর Native App version শনাক্ত করা যায়নি।");
        return;
      }

      const [versionSnapshot, linkSnapshot] = await Promise.all([
        get(ref(pathargataDb, "admin_settings/native_app_version")),
        get(ref(pathargataDb, "admin_settings/native_update_link")),
      ]);
      const latestVersion = normalizeAppVersion(versionSnapshot.val());
      if (!latestVersion) {
        setMessage(
          "Native update check চালু করতে সার্ভারের admin_settings/native_app_version এবং native_update_link সেট করতে হবে।",
        );
        return;
      }

      const comparison = compareAppVersions(latestVersion, installedVersion);
      if (comparison === null) {
        setMessage("সার্ভারে Native App-এর version format সঠিক নয়।");
        return;
      }
      if (comparison <= 0) {
        setMessage(
          comparison === 0
            ? `আপনি সর্বশেষ Native App version ${installedVersion} ব্যবহার করছেন।`
            : `ইনস্টল করা version ${installedVersion}; সার্ভারের version ${latestVersion}-এর চেয়ে নতুন।`,
        );
        return;
      }

      const updateUrl = safeHttpsUrl(linkSnapshot.val());
      setMessage(`নতুন Native App version ${latestVersion} পাওয়া গেছে।`);
      Alert.alert(
        "নতুন update পাওয়া গেছে",
        `ইনস্টল করা version: ${installedVersion}\nনতুন version: ${latestVersion}${updateUrl ? "" : "\nUpdate link সার্ভারে সেট করা নেই।"}`,
        updateUrl
          ? [
              { text: "পরে" },
              {
                text: "Update link খুলুন",
                onPress: () => void Linking.openURL(updateUrl),
              },
            ]
          : [{ text: "ঠিক আছে" }],
      );
    } catch {
      setMessage(
        "Native App-এর update তথ্য আনা যায়নি। ইন্টারনেট সংযোগ যাচাই করুন।",
      );
    } finally {
      setCheckingVersion(false);
    }
  }
  async function openPolicyLinks() {
    try {
      const [privacySnap, termsSnap] = await Promise.all([
        get(ref(pathargataDb, "admin_settings/privacy_link")),
        get(ref(pathargataDb, "admin_settings/terms_link")),
      ]);
      const privacyUrl = safeHttpsUrl(privacySnap.val());
      const termsUrl = safeHttpsUrl(termsSnap.val());
      if (!privacyUrl && !termsUrl) {
        setMessage("Privacy policy ও terms-এর লিংক এখনো প্রকাশ করা হয়নি।");
        return;
      }
      Alert.alert("নীতিমালা", "যে লিংকটি খুলতে চান সেটি বাছুন।", [
        ...(privacyUrl ? [{ text: "Privacy policy", onPress: () => void Linking.openURL(privacyUrl) }] : []),
        ...(termsUrl ? [{ text: "ব্যবহার বিধি ও terms", onPress: () => void Linking.openURL(termsUrl) }] : []),
        { text: "বন্ধ", style: "cancel" },
      ]);
    } catch {
      setMessage("Policy link পাওয়া যায়নি। পরে আবার চেষ্টা করুন।");
    }
  }
  async function sendPasswordResetLink() {
    if (!user?.email || passwordResetSending || passwordResetCooldown > 0) return;
    setPasswordResetSending(true);
    setPasswordResetCooldown(30);
    try {
      await sendPasswordResetEmail(pathargataAuth, user.email);
      setMessage("Password reset link ইমেইলে পাঠানো হয়েছে।");
    } catch {
      setMessage("Password reset email পাঠানো যায়নি।");
    } finally {
      setPasswordResetSending(false);
    }
  }
  function openPasswordChange() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
    setPasswordModalVisible(true);
  }
  async function changePassword() {
    if (!user?.email) {
      setMessage(
        "এই account-এ password login নেই। ইমেইল/password account দিয়ে চেষ্টা করুন।",
      );
      return;
    }
    if (
      !user.providerData.some((provider) => provider.providerId === "password")
    ) {
      setMessage(
        "এই account Google/Facebook দিয়ে খোলা। Password পরিবর্তনের জন্য ইমেইলে reset link পাঠানোর option ব্যবহার করুন।",
      );
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage("সব password field পূরণ করুন।");
      return;
    }
    if (newPassword.length < 6) {
      setMessage("নতুন password কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("নতুন password ও নিশ্চিতকরণ মিলছে না।");
      return;
    }
    if (currentPassword === newPassword) {
      setMessage("নতুন password আগের password থেকে আলাদা দিন।");
      return;
    }

    setPasswordChanging(true);
    setMessage("");
    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword,
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordModalVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("আপনার password সফলভাবে পরিবর্তন হয়েছে।");
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (
        code.includes("wrong-password") ||
        code.includes("invalid-credential")
      ) {
        setMessage("বর্তমান password সঠিক নয়।");
      } else if (code.includes("requires-recent-login")) {
        setMessage("নিরাপত্তার জন্য আবার লগইন করে password পরিবর্তন করুন।");
      } else if (code.includes("weak-password")) {
        setMessage("নতুন password আরও শক্তিশালী করুন।");
      } else {
        setMessage("Password পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।");
      }
    } finally {
      setPasswordChanging(false);
    }
  }
  function confirmUnblock(targetUid: string, name: string) {
    Alert.alert("আনব্লক করবেন?", `${name}-কে আনব্লক করতে চান?`, [
      { text: "বাতিল", style: "cancel" },
      {
        text: "আনব্লক",
        onPress: () => {
          if (!user) return;
          setUnblockingUid(targetUid);
          Promise.all([
            remove(
              ref(pathargataDb, `users/${user.uid}/blocked_users/${targetUid}`),
            ),
            remove(ref(pathargataDb, `user_blocks/${user.uid}/${targetUid}`)),
          ])
            .then(() => setMessage("ব্যবহারকারীকে আনব্লক করা হয়েছে।"))
            .catch(() => setMessage("আনব্লক করা যায়নি। আবার চেষ্টা করুন।"))
            .finally(() => setUnblockingUid(null));
        },
      },
    ]);
  }
  function requestDeactivation() {
    if (!user) return;
    const title = "অ্যাকাউন্ট সাময়িক ডিএক্টিভ করুন";
    const description =
      "আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ হবে এবং আপনি লগআউট হবেন। ৩০ দিনের মধ্যে পুনরায় সক্রিয় না করলে অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলার জন্য নির্ধারিত হবে।";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${description}`)) {
        void submitDeactivation();
      }
      return;
    }
    Alert.alert(title, description, [
      { text: "বাতিল", style: "cancel" },
      {
        text: "ডিএক্টিভ করুন",
        style: "destructive",
        onPress: () => void submitDeactivation(),
      },
    ]);
  }
  async function submitDeactivation() {
    if (!user) return;
    setDeactivating(true);
    try {
      const now = Date.now();
      await update(ref(pathargataDb), {
        [`users/${user.uid}/status`]: "deactivated",
        [`users/${user.uid}/deactivated_at`]: now,
        [`users/${user.uid}/deletion_due_at`]: now + 30 * 24 * 60 * 60 * 1000,
        [`account_lifecycle_requests/${user.uid}`]: { uid: user.uid, action: "deactivate", requestedAt: now },
      });
      await signOut(pathargataAuth);
      router.replace("/auth");
    } catch {
      setMessage("Account deactivation করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setDeactivating(false);
    }
  }
  function deleteAccount() {
    if (!user || deleting) return;
    const title = "অ্যাকাউন্ট মুছে ফেলার অনুরোধ";
    const description =
      "আপনার অ্যাকাউন্ট ৩০ দিনের grace period-এ ডিএক্টিভ হবে। এই সময়ের মধ্যে পুনরায় সক্রিয় না করলে অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলার জন্য নির্ধারিত হবে। আপনি কি নিশ্চিত?";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${description}`)) {
        void submitDeletion();
      }
      return;
    }
    Alert.alert(title, description, [
      { text: "বাতিল", style: "cancel" },
      {
        text: "অনুরোধ জমা দিন",
        style: "destructive",
        onPress: () => void submitDeletion(),
      },
    ]);
  }
  async function submitDeletion() {
    if (!user || deleting) return;
    setDeleting(true);
    setMessage("");
    try {
      const profile = (await import("firebase/database")).get(
        ref(pathargataDb, `users/${user.uid}`),
      );
      const snapshot = await profile;
      const value = snapshot.val() || {};
      await set(ref(pathargataDb, `account_deletion_requests/${user.uid}`), {
        uid: user.uid,
        name: value.name || user.displayName || "",
        email: user.email || "",
        phone: value.phone || "",
        profile_pic: value.profile_pic || "",
        timestamp: Date.now(),
      });
      const now = Date.now();
      await update(ref(pathargataDb), {
        [`users/${user.uid}/status`]: "deactivated",
        [`users/${user.uid}/deactivated_at`]: now,
        [`users/${user.uid}/deletion_due_at`]: now + 30 * 24 * 60 * 60 * 1000,
        [`account_lifecycle_requests/${user.uid}`]: { uid: user.uid, action: "delete", requestedAt: now },
      });
      await signOut(pathargataAuth);
      router.replace("/auth");
    } catch {
      setMessage("অ্যাকাউন্ট মুছে ফেলার অনুরোধ জমা হয়নি। সংযোগ যাচাই করে আবার চেষ্টা করুন।");
    } finally {
      setDeleting(false);
    }
  }
  if (!user)
    return (
      <ScreenContainer className="bg-background">
        <View className="flex-1 items-center justify-center p-5">
          <Text className="text-lg font-bold text-foreground">
            Settings দেখতে login করুন
          </Text>
          <TouchableOpacity
            className="rounded-full bg-primary px-5 py-3 mt-5"
            onPress={() => router.push("/auth")}
          >
            <Text className="font-bold text-white">লগইন করুন</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="flex-row items-center gap-3 mb-6">
          <TouchableOpacity
            className="h-10 w-10 rounded-full bg-surface items-center justify-center"
            onPress={() => safeGoBack("/(tabs)")}
          >
            <Ionicons name="arrow-back" size={21} color="#334155" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-foreground">সেটিংস</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="প্রোফাইল দেখুন বা সম্পাদনা করুন"
          className="rounded-3xl border border-border bg-surface p-4 mb-4 flex-row items-center"
          onPress={() => router.push("/(tabs)/profile")}
        >
          {(profileSummary.photo || user.photoURL) ? (
            <Image
              source={{ uri: profileSummary.photo || user.photoURL || "" }}
              className="h-14 w-14 rounded-full bg-background"
            />
          ) : (
            <View className="h-14 w-14 rounded-full bg-green-100 items-center justify-center">
              <Ionicons name="person-outline" size={26} color="#15803D" />
            </View>
          )}
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>
              {profileSummary.name || user.displayName || "আপনার প্রোফাইল"}
            </Text>
            <Text className="text-xs text-muted mt-1" numberOfLines={1}>
              {user.email || user.phoneNumber || "অ্যাকাউন্টের তথ্য"}
            </Text>
            {profileSummary.phone ? (
              <Text className="text-xs text-muted mt-1" numberOfLines={1}>
                {profileSummary.phone}
              </Text>
            ) : null}
          </View>
          <View className="rounded-full bg-green-50 px-3 py-2">
            <Text className="text-xs font-bold text-primary">সম্পাদনা</Text>
          </View>
        </TouchableOpacity>
        <Section title="অ্যাকাউন্ট">
          <SettingRow
            icon="key-outline"
            label="পাসওয়ার্ড পরিবর্তন করুন"
            onPress={openPasswordChange}
          />
          <SettingRow
            icon="people-outline"
            label="অন্য অ্যাকাউন্টে প্রবেশ করুন"
            onPress={() =>
              void signOut(pathargataAuth).then(() => router.replace("/auth"))
            }
          />
        </Section>
        <Section title="কমিউনিটি ও প্রোফাইল">
          <SettingRow
            icon="gift-outline"
            label="বন্ধুকে আমন্ত্রণ জানান"
            onPress={() => router.push("/invite")}
          />
          <SettingRow
            icon="checkmark-done-circle-outline"
            label="প্রোফাইল যাচাই"
            onPress={() => router.push("/verification")}
          />
        </Section>
        <Section title="গোপনীয়তা ও নিরাপত্তা">
          <SettingRow
            icon="person-remove-outline"
            label="ব্লক করা ব্যবহারকারী"
            onPress={() => {
              setBlockedLoading(true);
              setBlockedModalVisible(true);
            }}
          />
          <ToggleRow
            label="ফোন ও ইমেইল গোপন রাখুন"
            description="আপনার যোগাযোগের তথ্য প্রোফাইলে প্রকাশ করা হবে না।"
            value={settings.privacy_hide_contact}
            onChange={(value) =>
              void updateSetting("privacy_hide_contact", value)
            }
          />
          <ToggleRow
            label="অনলাইন স্ট্যাটাস দেখান"
            description="বন্ধ করলে অন্যরা আপনার অনলাইন থাকা দেখতে পাবে না।"
            value={settings.showOnline}
            onChange={(value) => void updateSetting("showOnline", value)}
          />
          <Text className="text-sm text-foreground mt-3 mb-2">
            অনুসন্ধানে আপনার প্রোফাইল দেখাবেন?
          </Text>
          <View className="flex-row gap-2">
            {(["everyone", "none"] as const).map((value) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: settings.profileVisibility === value }}
                className={`flex-1 rounded-xl border px-2 py-2.5 items-center ${settings.profileVisibility === value ? "bg-green-100 border-primary" : "border-border bg-surface"}`}
                onPress={() => void updateSetting("profileVisibility", value)}
              >
                <Text className="text-xs text-foreground">
                  {value === "everyone" ? "সবাই দেখতে পারবে" : "লুকানো থাকবে"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text className="text-[11px] text-muted mt-1">
            চালু করলে নাম, ছবি, এলাকা ও পেশার সীমিত তথ্য অনুসন্ধানে দেখা যাবে।
          </Text>
          <Text className="text-sm text-foreground mt-3 mb-2">কে আপনাকে বার্তা পাঠাতে পারবে?</Text>
          <View className="flex-row gap-2">
            {(["everyone", "friends", "requests"] as const).map((value) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: settings.messagePrivacy === value }}
                className={`flex-1 rounded-xl border px-2 py-2.5 items-center ${settings.messagePrivacy === value ? "bg-green-100 border-primary" : "border-border bg-surface"}`}
                onPress={() => void updateSetting("messagePrivacy", value)}
              >
                <Text className="text-xs text-foreground">{value === "everyone" ? "সবাই" : value === "friends" ? "শুধু বন্ধু" : "অনুরোধে"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ToggleRow
            label="বার্তা পড়ার চিহ্ন দেখান"
            description="বার্তা পড়লে প্রেরককে জানানো হবে।"
            value={settings.readReceipts}
            onChange={(value) => void updateSetting("readReceipts", value)}
          />
          <Text className="text-sm text-foreground mt-3 mb-2">
            ট্যাগিং পারমিশন
          </Text>
          <View className="flex-row gap-2">
            {(["everyone", "friends", "none"] as const).map((value) => (
              <TouchableOpacity
                key={value}
                className={`flex-1 rounded-xl border px-2 py-2.5 items-center ${settings.tagPermission === value ? "bg-green-100 border-primary" : "border-border bg-surface"}`}
                onPress={() => void updateSetting("tagPermission", value)}
              >
                <Text className="text-xs text-foreground">
                  {value === "everyone"
                    ? "সবাই"
                    : value === "friends"
                      ? "শুধু বন্ধু"
                      : "কেউ না"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>
        <Section
          title="নোটিফিকেশন পছন্দ"
          description="কোন পুশ অ্যালার্ট ও শব্দ পাবেন, তা এখানে নিয়ন্ত্রণ করুন।"
        >
          <ToggleRow
            label="পুশ নোটিফিকেশন চালু রাখুন"
            description="বন্ধ করলে নতুন পুশ অ্যালার্ট ডিভাইসে আসবে না; ইনবক্সের নোটিফিকেশন থাকবে।"
            value={settings.masterPush}
            onChange={(value) => void updateSetting("masterPush", value)}
          />
          <ToggleRow
            label="রক্তদান ও জরুরি অ্যালার্ট"
            description="জরুরি রক্তের অনুরোধের পুশ অ্যালার্ট।"
            value={settings.bloodAlert}
            onChange={(value) => void updateSetting("bloodAlert", value)}
            disabled={!settings.masterPush}
          />
          <ToggleRow
            label="বাজারদরের আপডেট"
            description="বাজারদর-সম্পর্কিত পুশ অ্যালার্ট।"
            value={settings.marketAlert}
            onChange={(value) => void updateSetting("marketAlert", value)}
            disabled={!settings.masterPush}
          />
          <ToggleRow
            label="নতুন বার্তার অ্যালার্ট ও শব্দ"
            description="নতুন বার্তার পুশ অ্যালার্ট এবং অ্যাপের শব্দ।"
            value={settings.messageAlert}
            onChange={(value) => void updateSetting("messageAlert", value)}
            disabled={!settings.masterPush}
          />
          <ToggleRow
            label="লাইক, মন্তব্য ও উল্লেখ"
            description="আপনার পোস্টের সামাজিক কার্যকলাপের পুশ অ্যালার্ট।"
            value={settings.postAlert}
            onChange={(value) => void updateSetting("postAlert", value)}
            disabled={!settings.masterPush}
          />
        </Section>
        <Section title="প্রদর্শন ও থিম">
          <ToggleRow
            label="ডার্ক মোড"
            description="অ্যাপের রঙের থিম গাঢ় বা হালকা করুন।"
            value={colorScheme === "dark"}
            onChange={(value) => void changeTheme(value)}
          />
          <Text className="text-sm text-foreground mt-3 mb-2">ফন্ট সাইজ</Text>
          <View className="flex-row gap-2">
            {["small", "normal", "large"].map((value) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: fontSize === value }}
                className={`flex-1 rounded-xl border py-2.5 items-center ${fontSize === value ? "bg-green-100 border-primary" : "border-border bg-surface"}`}
                onPress={() => void changeFontSize(value)}
              >
                <Text className="text-xs text-foreground">
                  {value === "small"
                    ? "ছোট"
                    : value === "large"
                      ? "বড়"
                      : "স্বাভাবিক"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>
        <Section title="ডেটা ও স্টোরেজ">
          <ToggleRow
            label="ডেটা সেভার মোড"
            description="Feed ছবির quality কমাবে এবং audio/video media লোড বন্ধ রাখবে।"
            value={dataSaver}
            onChange={(value) => void changeDataSaver(value)}
          />
          <SettingRow
            icon="trash-bin-outline"
            label="Trash Bin"
            onPress={() => router.push("/trash-bin" as any)}
          />
          <SettingRow
            icon="trash-bin-outline"
            label={clearingCache ? "ক্যাশ পরিষ্কার হচ্ছে..." : "অস্থায়ী ক্যাশ পরিষ্কার করুন"}
            onPress={() => void clearCache()}
            disabled={clearingCache}
            loading={clearingCache}
          />
        </Section>
        <Section title="সহায়তা ও অ্যাপ">
          <SettingRow
            icon="chatbox-ellipses-outline"
            label="মতামত ও Missing Query"
            onPress={() => router.push("/feedback")}
          />
          <SettingRow
            icon="bookmark-outline"
            label="সংরক্ষিত পোস্ট"
            onPress={() => router.push("/saved-posts")}
          />
          <SettingRow
            icon="document-text-outline"
            label="ব্যবহারবিধি ও গোপনীয়তা নীতি"
            onPress={() => void openPolicyLinks()}
          />
          <SettingRow
            icon="refresh-outline"
            label={
              checkingVersion
                ? "অ্যাপের আপডেট যাচাই হচ্ছে..."
                : "আপডেট খুঁজুন"
            }
            onPress={() => void checkForNativeUpdate()}
          />
          <View className="flex-row items-center py-3">
            <Ionicons name="information-circle-outline" size={20} color="#15803D" />
            <Text className="ml-3 flex-1 text-sm text-muted">অ্যাপ সংস্করণ</Text>
            <Text className="text-sm font-semibold text-foreground">
              {Constants.expoConfig?.version || "অজানা"}
            </Text>
          </View>
        </Section>
        {message ? (
          <Text accessibilityRole="alert" className="text-sm text-primary text-center my-3">
            {message}
          </Text>
        ) : null}
        <Modal
          visible={passwordModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPasswordModalVisible(false)}
        >
          <KeyboardAvoidingView
            className="flex-1 justify-center bg-black/50 px-5"
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            <View className="rounded-3xl bg-surface p-5">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xl font-bold text-foreground">
                  Password পরিবর্তন
                </Text>
                <TouchableOpacity
                  accessibilityLabel="বন্ধ করুন"
                  onPress={() => setPasswordModalVisible(false)}
                  disabled={passwordChanging || passwordResetSending}
                >
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>
              <Text className="text-sm text-muted mb-4">
                নিরাপত্তার জন্য বর্তমান password যাচাই করতে হবে।
              </Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoComplete="current-password"
                autoCapitalize="none"
                textContentType="password"
                importantForAutofill="yes"
                placeholder="বর্তমান password"
                placeholderTextColor="#94A3B8"
                className="input mb-3"
              />
              {user?.email ? (
                <View className="mb-3 rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3">
                  <Text className="text-xs leading-5 text-orange-900">
                    বর্তমান password মনে না থাকলে ইমেইলে reset link পাঠান। নিরাপত্তার জন্য অল্প সময়ের মধ্যে আবার request পাঠানো যাবে না।
                  </Text>
                  <TouchableOpacity
                    className="mt-2 self-start"
                    onPress={() => void sendPasswordResetLink()}
                    disabled={passwordResetSending || passwordResetCooldown > 0}
                    accessibilityRole="button"
                    accessibilityLabel="পাসওয়ার্ড রিসেট লিংক পাঠান"
                  >
                    <Text className={`text-sm font-bold ${passwordResetSending || passwordResetCooldown > 0 ? "text-orange-400" : "text-orange-700"}`}>
                      {passwordResetSending ? "লিংক পাঠানো হচ্ছে..." : passwordResetCooldown > 0 ? `আবার পাঠাতে ${passwordResetCooldown} সেকেন্ড অপেক্ষা করুন` : "পাসওয়ার্ড রিসেট লিংক পাঠান"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoComplete="new-password"
                autoCapitalize="none"
                textContentType="newPassword"
                importantForAutofill="yes"
                placeholder="নতুন password (কমপক্ষে ৬ অক্ষর)"
                placeholderTextColor="#94A3B8"
                className="input mb-3"
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                autoCapitalize="none"
                textContentType="newPassword"
                importantForAutofill="yes"
                placeholder="নতুন password আবার লিখুন"
                placeholderTextColor="#94A3B8"
                className="input mb-4"
              />
              {message ? (
                <Text className="text-sm text-error mb-3">{message}</Text>
              ) : null}
              <TouchableOpacity
                className="rounded-2xl bg-primary py-4 items-center"
                onPress={() => void changePassword()}
                disabled={passwordChanging}
              >
                {passwordChanging ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="font-bold text-white">
                    Password পরিবর্তন করুন
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal
          visible={blockedModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setBlockedModalVisible(false)}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="max-h-[80%] rounded-t-3xl bg-background px-5 pt-5 pb-8">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-foreground">
                  ব্লক করা ব্যবহারকারী
                </Text>
                <TouchableOpacity
                  accessibilityLabel="বন্ধ করুন"
                  onPress={() => setBlockedModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>
              {blockedLoading ? (
                <View className="py-10 items-center">
                  <ActivityIndicator color="#15803D" />
                </View>
              ) : blockedUsers.length === 0 ? (
                <Text className="text-sm text-muted text-center py-10">
                  কাউকে ব্লক করা হয়নি।
                </Text>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled">
                  {blockedUsers.map((blocked) => (
                    <View
                      key={blocked.uid}
                      className="flex-row items-center border-b border-border py-3"
                    >
                      {blocked.photo ? (
                        <Image
                          source={{ uri: blocked.photo }}
                          className="h-11 w-11 rounded-full bg-surface"
                        />
                      ) : (
                        <View className="h-11 w-11 rounded-full bg-green-100 items-center justify-center">
                          <Text className="font-bold text-primary">
                            {blocked.name.slice(0, 1)}
                          </Text>
                        </View>
                      )}
                      <Text
                        className="ml-3 flex-1 text-sm font-semibold text-foreground"
                        numberOfLines={1}
                      >
                        {blocked.name}
                      </Text>
                      <TouchableOpacity
                        className="rounded-xl border border-border bg-surface px-3 py-2"
                        disabled={unblockingUid !== null}
                        onPress={() =>
                          confirmUnblock(blocked.uid, blocked.name)
                        }
                      >
                        {unblockingUid === blocked.uid ? (
                          <ActivityIndicator size="small" color="#15803D" />
                        ) : (
                          <Text className="text-xs font-bold text-primary">
                            আনব্লক
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
        <View className="rounded-3xl border border-red-200 bg-red-50 p-4 mt-2">
          <Text className="text-sm font-bold text-red-700 mb-3">
            অ্যাকাউন্ট বন্ধ বা মুছে ফেলা
          </Text>
          <Text className="text-xs leading-5 text-red-800 mb-3">
            ডিএক্টিভেশন বা মুছে ফেলার অনুরোধের পর অ্যাকাউন্টে প্রবেশ বন্ধ হবে। মুছে ফেলার আগে ৩০ দিনের মধ্যে পুনরায় সক্রিয় করার সুযোগ থাকবে।
          </Text>
          <TouchableOpacity
            className="rounded-2xl border border-amber-500 bg-amber-50 py-3 items-center mb-3"
            onPress={requestDeactivation}
            disabled={deactivating || deleting}
          >
            {deactivating ? (
              <ActivityIndicator color="#B45309" />
            ) : (
              <Text className="font-bold text-amber-700">
                অ্যাকাউন্ট সাময়িক ডিএক্টিভ করুন
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-2xl border border-red-500 py-3 items-center"
            onPress={deleteAccount}
            disabled={deleting || deactivating}
          >
            {deleting ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <Text className="font-bold text-red-600">
                অ্যাকাউন্ট মুছে ফেলার অনুরোধ
              </Text>
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          className="rounded-2xl bg-surface border border-border py-4 items-center mt-5"
          onPress={() => void signOut(pathargataAuth)}
        >
          <Text className="font-bold text-foreground">লগআউট</Text>
        </TouchableOpacity>
        <Text className="text-center text-xs text-muted mt-6">
          পাথরঘাটা ডিজিটাল কমিউনিটি লিমিটেড
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-3xl bg-surface border border-border overflow-hidden p-4 mb-4">
      <Text className="text-sm font-bold text-muted mb-3">{title}</Text>
      {description ? (
        <Text className="text-xs leading-5 text-muted -mt-1 mb-3">
          {description}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
function SettingRow({
  icon,
  label,
  onPress,
  disabled = false,
  loading = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole={onPress ? "button" : undefined}
      disabled={disabled || !onPress}
      className={`flex-row items-center py-3 ${disabled ? "opacity-60" : ""}`}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color="#15803D" />
      <Text className="ml-3 flex-1 text-sm text-foreground">{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#15803D" />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      ) : null}
    </TouchableOpacity>
  );
}
function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      className={`flex-row items-center justify-between py-3 ${disabled ? "opacity-45" : ""}`}
      onPress={() => onChange(!value)}
    >
      <View className="flex-1 pr-4">
        <Text className="text-sm text-foreground">{label}</Text>
        {description ? (
          <Text className="text-xs leading-5 text-muted mt-1">{description}</Text>
        ) : null}
      </View>
      <View
        className={`h-7 w-12 rounded-full p-1 ${value ? "bg-primary" : "bg-border"}`}
      >
        <View
          className={`h-5 w-5 rounded-full bg-white ${value ? "ml-5" : "ml-0"}`}
        />
      </View>
    </TouchableOpacity>
  );
}
