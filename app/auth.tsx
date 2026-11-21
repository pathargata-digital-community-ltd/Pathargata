import { safeGoBack } from "@/lib/safe-navigation";
import { useRemoteControls } from "@/hooks/use-remote-controls";
import {
  getFreshWithCache,
  onValueWithCache as onValue,
} from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { detectPathargataArea } from "@/lib/area-access";
import { safeHttpsUrl } from "@/lib/app-version";

const unionLabels: Record<string, string> = {
  "Patharghata Union Sadar": "পাথরঘাটা সদর",
  "Char Duani Union": "চরদুয়ানী",
  Kakchira: "কাকচিরা",
  "Kakchira Union": "কাকচিরা",
  Kalmegha: "কালমেঘা",
  "Kalmegha Union": "কালমেঘা",
  Kathaltoli: "কাঁঠালতলী",
  "Kathaltoli Union": "কাঁঠালতলী",
  Nachnapara: "নাচনাপাড়া",
  "Nachnapara Union": "নাচনাপাড়া",
  Raihanpur: "রায়হানপুর",
  "Raihanpur Union": "রায়হানপুর",
};

type Mode = "login" | "register" | "forgot";
type OAuthProviderName = "google" | "facebook";

type PublicOAuthConfig = {
  googleWebClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
  facebookAppId?: string;
};

function getOAuthConfig(): PublicOAuthConfig {
  return (Constants.expoConfig?.extra || {}) as PublicOAuthConfig;
}

function firebaseErrorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (
    code.includes("invalid-credential") ||
    code.includes("wrong-password") ||
    code.includes("user-not-found")
  )
    return "ইমেইল বা পাসওয়ার্ড সঠিক নয়।";
  if (code.includes("email-already-in-use"))
    return "এই ইমেইল দিয়ে ইতিমধ্যে account আছে।";
  if (code.includes("weak-password"))
    return "পাসওয়ার্ড আরও শক্তিশালী করুন। কমপক্ষে ৬ অক্ষর দিন।";
  if (code.includes("invalid-email")) return "সঠিক ইমেইল ঠিকানা দিন।";
  if (code.includes("popup-closed")) return "লগইন বাতিল করা হয়েছে।";
  if (code.includes("account-exists-with-different-credential"))
    return "এই ইমেইল দিয়ে অন্য login method-এ account খোলা আছে।";
  return "সার্ভারের সঙ্গে যোগাযোগ করা যায়নি। আবার চেষ্টা করুন।";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || formatDateInput(date) !== value) return false;
  const today = new Date();
  const earliest = new Date(1900, 0, 1);
  const latest = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date >= earliest && date <= latest;
}

async function ensureFirebaseProfile(
  user: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    phoneNumber: string | null;
  },
  provider: OAuthProviderName,
) {
  const profileRef = ref(pathargataDb, `users/${user.uid}`);
  const { get } = await import("firebase/database");
  const snapshot = await get(profileRef);
  if (snapshot.exists()) return "existing" as const;
  const area = await detectPathargataArea();
  await set(profileRef, {
      name:
        user.displayName ||
        `${provider === "google" ? "Google" : "Facebook"} User`,
      email: user.email || "",
      uid: user.uid,
      profile_pic: user.photoURL || "",
      role: "user",
      union: "Unknown",
      village: "Unknown",
      joinDate: new Date().toLocaleDateString("bn-BD"),
      isVerified: false,
      status: area.state === "approved" ? "user" : "pending_review",
      accountAccess: area.state === "approved" ? "approved" : "locked",
      accessReview: area.state === "approved" ? "not_required" : "pending",
      accessReason: area.reason,
      registrationLatitude: area.latitude,
      registrationLongitude: area.longitude,
      phone: user.phoneNumber || "",
    });
  return area.state === "approved" ? "new_approved" : "new_pending";
}

export default function AuthScreen() {
  const { flags, emergency } = useRemoteControls();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ ref?: string | string[] }>();
  const incomingReferral = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const initialReferral = incomingReferral?.trim() || "";
  const [mode, setMode] = useState<Mode>(initialReferral ? "register" : "login");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [union, setUnion] = useState("");
  const [unionOptions, setUnionOptions] = useState<string[]>([]);
  const [village, setVillage] = useState("");
  const [villages, setVillages] = useState<string[]>([]);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationPicker, setLocationPicker] = useState<"union" | "village" | null>(null);
  const [dob, setDob] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<"Male" | "Female">("Male");
  const [referralCode, setReferralCode] = useState(initialReferral);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProviderName | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState<string | null>(null);

  useEffect(() => {
    const code = incomingReferral?.trim();
    if (!code) return;
    const timer = setTimeout(() => {
      setReferralCode((current) => current || code);
      setMode("register");
      setStep(1);
    }, 0);
    return () => clearTimeout(timer);
  }, [incomingReferral]);

  const oauthConfig = getOAuthConfig();
  useEffect(() => {
    let active = true;
    void getFreshWithCache<Record<string, unknown>>(
      ref(pathargataDb, "locations"),
      24 * 60 * 60 * 1000,
    )
      .then(({ value }) => {
        if (!active) return;
        const options = value && typeof value === "object" ? Object.keys(value).filter(Boolean).sort((a, b) => (unionLabels[a] || a).localeCompare(unionLabels[b] || b, "bn")) : [];
        setUnionOptions(options);
        if (options.length) setUnion((current) => current || options[0]);
      })
      .catch(() => { if (active) setUnionOptions([]); })
      .finally(() => { if (active) setLocationLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void get(ref(pathargataDb, "admin_settings/privacy_link"))
      .then((snapshot) => {
        if (active) setPrivacyPolicyUrl(safeHttpsUrl(snapshot.val()));
      })
      .catch(() => {
        if (active) setPrivacyPolicyUrl(null);
      });
    return () => {
      active = false;
    };
  }, []);
  const [googleRequest, googleResponse, promptGoogle] = Google.useAuthRequest({
    webClientId: oauthConfig.googleWebClientId,
    iosClientId: oauthConfig.googleIosClientId,
    androidClientId: oauthConfig.googleAndroidClientId,
    selectAccount: true,
  });
  const facebookDiscovery = useMemo(
    () => ({
      authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth",
    }),
    [],
  );
  const [facebookRequest, facebookResponse, promptFacebook] =
    AuthSession.useAuthRequest(
      {
        clientId: oauthConfig.facebookAppId || "missing-facebook-app-id",
        responseType: AuthSession.ResponseType.Token,
        scopes: ["public_profile", "email"],
        redirectUri: AuthSession.makeRedirectUri({
          scheme:
            typeof Constants.expoConfig?.scheme === "string"
              ? Constants.expoConfig.scheme
              : undefined,
        }),
      },
      facebookDiscovery,
    );

  async function finishOAuth(
    credential: ReturnType<typeof GoogleAuthProvider.credential>,
    provider: OAuthProviderName,
  ) {
    setOauthLoading(provider);
    setMessage("");
    try {
      const result = await signInWithCredential(pathargataAuth, credential);
      const access = await ensureFirebaseProfile(result.user, provider);
      if (access === "new_pending") router.replace("/area-approval" as any);
      else safeGoBack("/(tabs)");
    } catch (error) {
      setMessage(firebaseErrorMessage(error));
    } finally {
      setOauthLoading(null);
    }
  }

  useFocusEffect(useCallback(() => {
    if (!union) return;
    return onValue(
      ref(pathargataDb, `locations/${union}`),
      (snapshot) => {
        const value = snapshot.val();
        const next = Array.isArray(value)
          ? value.filter(Boolean).map(String)
          : Object.values(value || {})
              .filter(Boolean)
              .map(String);
        setVillages(next);
      },
      () => setVillages([]),
    );
  }, [union]));

  useEffect(() => {
    if (googleResponse?.type !== "success") return;
    const token = googleResponse.authentication?.idToken;
    if (!token) return;
    // OAuth callbacks are external-system events; finishOAuth updates the UI after the credential exchange.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void finishOAuth(
      GoogleAuthProvider.credential(
        token,
        googleResponse.authentication?.accessToken,
      ),
      "google",
    );
  }, [googleResponse]);

  useEffect(() => {
    if (facebookResponse?.type !== "success") return;
    const token = facebookResponse.params?.access_token;
    if (!token) return;
    // OAuth callbacks are external-system events; finishOAuth updates the UI after the credential exchange.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void finishOAuth(FacebookAuthProvider.credential(token), "facebook");
  }, [facebookResponse]);

  async function handleOAuth(provider: OAuthProviderName) {
    setMessage("");
    if (Platform.OS === "web") {
      setOauthLoading(provider);
      try {
        const authProvider =
          provider === "google"
            ? new GoogleAuthProvider()
            : new FacebookAuthProvider();
        if (provider === "google")
          authProvider.setCustomParameters({ prompt: "select_account" });
        const result = await signInWithPopup(pathargataAuth, authProvider);
        const access = await ensureFirebaseProfile(result.user, provider);
        if (access === "new_pending") router.replace("/area-approval" as any);
        else safeGoBack("/(tabs)");
      } catch (error) {
        setMessage(firebaseErrorMessage(error));
      } finally {
        setOauthLoading(null);
      }
      return;
    }
    if (provider === "google") {
      if (
        !googleRequest ||
        (!oauthConfig.googleAndroidClientId && !oauthConfig.googleIosClientId)
      ) {
        setMessage(
          "Native Google login চালু করতে Google OAuth client ID configuration প্রয়োজন।",
        );
        return;
      }
      await promptGoogle();
    } else {
      if (!facebookRequest || !oauthConfig.facebookAppId) {
        setMessage(
          "Native Facebook login চালু করতে Facebook App ID configuration প্রয়োজন।",
        );
        return;
      }
      await promptFacebook();
    }
  }

  function switchMode(next: Mode) {
    if (next === "register" && (!flags.registration || emergency.readOnly)) { setMessage(emergency.readOnly ? "জরুরি read-only mode চালু আছে।" : "নতুন registration আপাতত বন্ধ আছে।"); return; }
    setMode(next);
    setStep(1);
    setMessage("");
  }

  function goBackFromAuth() {
    if (mode === "register") {
      if (step > 1) setStep((current) => current - 1);
      else switchMode("login");
      return;
    }
    if (mode === "forgot") {
      switchMode("login");
      return;
    }
    safeGoBack("/(tabs)");
  }

  function validateRegistrationStep(nextStep: number) {
    if (nextStep === 2) {
      const validName = /^[a-zA-Z\u0980-\u09FF\s]+$/.test(name.trim());
      if (!name.trim() || !email.trim() || !phone.trim())
        return "নাম, ইমেইল এবং মোবাইল নাম্বার দিন।";
      if (!validName) return "নামে ইমোজি বা symbol ব্যবহার করা যাবে না।";
      if (name.trim().length > 20) return "নাম ২০ অক্ষরের বেশি হতে পারবে না।";
      if (!EMAIL_PATTERN.test(email.trim())) return "সঠিক email address দিন, যেমন: example@gmail.com।";
      if (!/^01[3-9]\d{8}$/.test(phone))
        return "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।";
    }
    if (nextStep === 3 && (!union || !village.trim()))
      return "ইউনিয়ন এবং গ্রাম নির্বাচন করুন।";
    if (nextStep === 4 && !isValidBirthDate(dob)) return "ক্যালেন্ডার থেকে 1900 সাল থেকে আজকের মধ্যে সঠিক জন্ম তারিখ নির্বাচন করুন।";
    if (nextStep === 4 && (!password || password.length < 6))
      return "কমপক্ষে ৬ অক্ষরের password দিন।";
    if (nextStep === 4 && password !== confirmPassword)
      return "পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না।";
    return "";
  }

  function moveToStep(nextStep: number) {
    const validation = validateRegistrationStep(nextStep === 4 ? 3 : nextStep);
    if (validation) {
      setMessage(validation);
      return;
    }
    setMessage("");
    setStep(nextStep);
  }

  async function pickProfileImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("প্রোফাইল ছবি বাছতে photo permission প্রয়োজন।");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) setProfileImage(result.assets[0]?.uri || null);
  }

  async function submitRegistration() {
    if (!flags.registration || emergency.readOnly) { setMessage(emergency.readOnly ? "জরুরি read-only mode চালু আছে। নতুন account তৈরি করা যাচ্ছে না।" : "নতুন registration আপাতত বন্ধ আছে।"); return; }
    const validation = validateRegistrationStep(4);
    if (validation) {
      setMessage(validation);
      return;
    }
    if (!privacyAccepted) {
      setMessage("গোপনীয়তা ও নীতিমালার সঙ্গে সম্মতি দিন।");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const area = await detectPathargataArea();
      const credential = await createUserWithEmailAndPassword(
        pathargataAuth,
        email.trim(),
        password,
      );
      await updateProfile(credential.user, {
        displayName: name.trim(),
        photoURL: profileImage || undefined,
      });
      await set(ref(pathargataDb, `users/${credential.user.uid}`), {
        uid: credential.user.uid,
        name: name.trim(),
        email: email.trim(),
        phone,
        union,
        village: village.trim(),
        dob,
        gender,
        role: "user",
        joinDate: new Date().toLocaleDateString("bn-BD"),
        isVerified: false,
        profile_pic: profileImage || "",
        status: area.state === "approved" ? "offline" : "pending_review",
        accountAccess: area.state === "approved" ? "approved" : "locked",
        accessReview: area.state === "approved" ? "not_required" : "pending",
        accessReason: area.reason,
        registrationLatitude: area.latitude,
        registrationLongitude: area.longitude,
      });
      if (referralCode.trim() && referralCode.trim() !== credential.user.uid) {
        await set(
          ref(pathargataDb, `referral_events/${referralCode.trim()}/${credential.user.uid}`),
          { uid: credential.user.uid, timestamp: Date.now() },
        );
      }
      if (area.state === "pending_review") router.replace("/area-approval" as any);
      else safeGoBack("/(tabs)");
    } catch (error) {
      setMessage(firebaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitLogin() {
    if (!email.trim() || !password) {
      setMessage("আপনার ইমেইল ও password দিন।");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await signInWithEmailAndPassword(
        pathargataAuth,
        email.trim(),
        password,
      );
      safeGoBack("/(tabs)");
    } catch (error) {
      setMessage(firebaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotPassword() {
    if (!email.trim()) {
      setMessage("আপনার ইমেইল দিন।");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await sendPasswordResetEmail(pathargataAuth, email.trim());
      setMessage("Password reset link আপনার ইমেইলে পাঠানো হয়েছে।");
    } catch (error) {
      setMessage(firebaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "login"
      ? "আবার স্বাগতম"
      : mode === "forgot"
        ? "Password reset করুন"
        : "নতুন account খুলুন";
  const isOAuthBusy = oauthLoading !== null;
  const brandTitleFontSize = Math.min(30, Math.max(22, windowWidth * 0.075));

  return (
    <ScreenContainer className="bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 180, flexGrow: 1 }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        >
          <TouchableOpacity
            className="h-10 w-10 rounded-full bg-surface items-center justify-center mb-7"
            onPress={goBackFromAuth}
            accessibilityRole="button"
            accessibilityLabel={mode === "register" ? (step > 1 ? "আগের ধাপ" : "লগইনে ফিরে যান") : "পেছনে যান"}
          >
            <Ionicons name="arrow-back" size={21} color="#94A3B8" />
          </TouchableOpacity>
          <View className="items-center mb-7">
            <View className="h-20 w-20 items-center justify-center mb-4">
              <Image source={require("@/assets/images/pathargata-logo-transparent.png")} style={{ width: 64, height: 64 }} resizeMode="contain" />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              className="w-full text-center font-bold text-foreground"
              style={{
                fontSize: brandTitleFontSize,
                lineHeight: Math.ceil(brandTitleFontSize * 1.25),
              }}
            >
              পাথরঘাটা ডিজিটাল
            </Text>
            <Text className="text-sm text-muted mt-1">স্মার্ট উপজেলা সেবা</Text>
          </View>

          <Text className="text-2xl font-bold text-foreground">{mode === "register" ? (["ব্যক্তিগত তথ্য", "এলাকা নির্বাচন", "প্রোফাইল তথ্য", "নিরাপদ অ্যাকাউন্ট"][step - 1] || title) : title}</Text>
          <Text className="text-sm text-muted mt-2 mb-6">
            পাথরঘাটা ডিজিটালে আপনার community account
          </Text>

          {mode === "register" ? (
            <>
              <View className="flex-row items-center gap-1 mb-6">
                {[1, 2, 3, 4].map((item) => (
                  <View
                    key={item}
                    className={`h-1.5 flex-1 rounded-full ${item <= step ? "bg-primary" : "bg-border"}`}
                  />
                ))}
                <Text className="text-xs text-muted ml-2">ধাপ {step}/৪</Text>
              </View>
              {step === 1 ? (
                <>
                  <FieldLabel label="আপনার নাম *" />
                  <TextInput
                    value={name}
                    onChangeText={(value) =>
                      setName(value.replace(/[^a-zA-Z\u0980-\u09FF\s]/g, ""))
                    }
                    maxLength={20}
                    placeholder="নাম (বাংলা বা English)"
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-border bg-surface px-4 py-4 text-foreground mb-4"
                  />
                  <FieldLabel label="মোবাইল নাম্বার *" />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={11}
                    placeholder="017XXXXXXXX"
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-border bg-surface px-4 py-4 text-foreground mb-4"
                  />
                  <FieldLabel label="ইমেইল *" />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoComplete="email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    importantForAutofill="yes"
                    placeholder="example@gmail.com"
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-border bg-surface px-4 py-4 text-foreground mb-5"
                  />
                  <PrimaryButton
                    label="পরবর্তী ধাপ"
                    onPress={() => moveToStep(2)}
                  />
                </>
              ) : null}
              {step === 2 ? (
                <>
                  <Text className="text-sm leading-5 text-muted mb-5">আপনার ইউনিয়ন ও গ্রাম সার্ভারের তালিকা থেকে বেছে নিন। Registration-এর সময় GPS দিয়ে পাথরঘাটা এলাকার উপস্থিতি যাচাই হবে। এলাকার বাইরে থাকলে account সাময়িকভাবে locked থাকবে এবং NID দিয়ে admin approval নিতে হবে।</Text>
                  <FieldLabel label="ইউনিয়ন নির্বাচন করুন *" />
                  <TouchableOpacity accessibilityRole="button" onPress={() => setLocationPicker("union")} disabled={locationLoading || unionOptions.length === 0} className="flex-row items-center rounded-2xl border border-border bg-surface px-4 py-4 mb-5">
                    <Ionicons name="location-outline" size={20} color="#15803D" />
                    <Text className="ml-3 flex-1 text-sm text-foreground">{locationLoading ? "ইউনিয়ন লোড হচ্ছে..." : union ? (unionLabels[union] || union) : "ইউনিয়ন বেছে নিন"}</Text>
                    {locationLoading ? <ActivityIndicator size="small" color="#15803D" /> : <Ionicons name="chevron-down" size={20} color="#94A3B8" />}
                  </TouchableOpacity>
                  {!locationLoading && unionOptions.length === 0 ? <Text className="text-xs text-red-600 mb-4">সার্ভারের `locations` তালিকা পাওয়া যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।</Text> : null}
                  <FieldLabel label="গ্রাম/মহল্লা নির্বাচন করুন *" />
                  <TouchableOpacity accessibilityRole="button" onPress={() => setLocationPicker("village")} disabled={!union || villages.length === 0} className="flex-row items-center rounded-2xl border border-border bg-surface px-4 py-4 mb-4">
                    <Ionicons name="home-outline" size={20} color="#15803D" />
                    <Text className="ml-3 flex-1 text-sm text-foreground">{!union ? "আগে ইউনিয়ন নির্বাচন করুন" : villages.length ? (village || "গ্রাম/মহল্লা বেছে নিন") : "এই ইউনিয়নে গ্রাম পাওয়া যায়নি"}</Text>
                    <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                  </TouchableOpacity>
                  <View className="flex-row gap-3">
                    <SecondaryButton label="পেছনে" onPress={() => setStep(1)} />
                    <PrimaryButton label="পরবর্তী ধাপ" onPress={() => moveToStep(3)} />
                  </View>
                </>
              ) : null}
              {step === 3 ? (
                <>
                  <TouchableOpacity
                    onPress={pickProfileImage}
                    className="items-center mb-5"
                  >
                    <View className="h-24 w-24 rounded-full bg-green-100 border-2 border-dashed border-primary items-center justify-center overflow-hidden">
                      {profileImage ? (
                        <Image
                          source={{ uri: profileImage }}
                          className="h-full w-full"
                        />
                      ) : (
                        <Ionicons
                          name="camera-outline"
                          size={31}
                          color="#15803D"
                        />
                      )}
                    </View>
                    <Text className="text-xs text-muted mt-2">
                      প্রোফাইল ছবি (ঐচ্ছিক)
                    </Text>
                  </TouchableOpacity>
                  <FieldLabel label="জন্ম তারিখ" />
                  {Platform.OS === "web" ? (
                    <TextInput
                      value={dob}
                      onChangeText={setDob}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94A3B8"
                      maxLength={10}
                      className="rounded-2xl border border-border bg-surface px-4 py-4 text-foreground mb-4"
                    />
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => setShowDatePicker(true)} className="flex-row items-center rounded-2xl border border-border bg-surface px-4 py-4 mb-4">
                        <Ionicons name="calendar-outline" size={20} color="#15803D" />
                        <Text className={`ml-3 flex-1 text-sm ${dob ? "text-foreground" : "text-muted"}`}>{dob || "ক্যালেন্ডার থেকে জন্ম তারিখ নির্বাচন করুন"}</Text>
                        <Ionicons name="chevron-down" size={19} color="#94A3B8" />
                      </TouchableOpacity>
                      {showDatePicker ? <DateTimePicker
                        value={dob ? new Date(`${dob}T00:00:00`) : new Date(2000, 0, 1)}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        maximumDate={new Date()}
                        minimumDate={new Date(1900, 0, 1)}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS !== "ios") setShowDatePicker(false);
                          if (event.type === "dismissed" || !selectedDate) return;
                          setDob(formatDateInput(selectedDate));
                        }}
                      /> : null}
                    </>
                  )}
                  <FieldLabel label="লিঙ্গ" />
                  <View className="flex-row gap-2 mb-5">
                    <TouchableOpacity
                      onPress={() => setGender("Male")}
                      className={`rounded-full px-4 py-2 border ${gender === "Male" ? "bg-green-100 border-primary" : "bg-surface border-border"}`}
                    >
                      <Text className="text-sm text-foreground">পুরুষ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setGender("Female")}
                      className={`rounded-full px-4 py-2 border ${gender === "Female" ? "bg-green-100 border-primary" : "bg-surface border-border"}`}
                    >
                      <Text className="text-sm text-foreground">মহিলা</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row gap-3">
                    <SecondaryButton label="পেছনে" onPress={() => setStep(2)} />
                    <PrimaryButton
                      label="পরবর্তী ধাপ"
                      onPress={() => moveToStep(4)}
                    />
                  </View>
                </>
              ) : null}
              {step === 4 ? (
                <>
                  <FieldLabel label="পাসওয়ার্ড সেট করুন *" />
                  <View className="flex-row items-center rounded-2xl border border-border bg-surface px-4 mb-4">
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      placeholder="কমপক্ষে ৬ অক্ষর"
                      placeholderTextColor="#94A3B8"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      importantForAutofill="yes"
                      autoCapitalize="none"
                      className="flex-1 py-4 text-foreground"
                    />
                    <TouchableOpacity accessibilityLabel={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান"} onPress={() => setShowPassword((value) => !value)} className="p-2"><Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#94A3B8" /></TouchableOpacity>
                  </View>
                  <FieldLabel label="কনফার্ম পাসওয়ার্ড *" />
                  <View className="flex-row items-center rounded-2xl border border-border bg-surface px-4 mb-4">
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      placeholder="পাসওয়ার্ড আবার লিখুন"
                      placeholderTextColor="#94A3B8"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      importantForAutofill="yes"
                      autoCapitalize="none"
                      className="flex-1 py-4 text-foreground"
                    />
                    <TouchableOpacity accessibilityLabel={showConfirmPassword ? "কনফার্ম পাসওয়ার্ড লুকান" : "কনফার্ম পাসওয়ার্ড দেখান"} onPress={() => setShowConfirmPassword((value) => !value)} className="p-2"><Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#94A3B8" /></TouchableOpacity>
                  </View>
                  <FieldLabel label="রেফার কোড (ঐচ্ছিক)" />
                  <TextInput
                    value={referralCode}
                    onChangeText={setReferralCode}
                    placeholder="বন্ধুর referral code"
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-border bg-surface px-4 py-4 text-foreground mb-4"
                  />
                  <View className="flex-row items-start gap-3 rounded-2xl bg-surface border border-border p-3 mb-5">
                    <TouchableOpacity onPress={() => setPrivacyAccepted((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: privacyAccepted }}>
                    <View
                      className={`h-5 w-5 rounded border items-center justify-center ${privacyAccepted ? "bg-primary border-primary" : "border-border"}`}
                    >
                      {privacyAccepted ? (
                        <Ionicons name="checkmark" size={18} color="white" />
                      ) : null}
                    </View>
                    </TouchableOpacity>
                    <Text className="flex-1 text-xs leading-5 text-muted">
                      আমি <Text onPress={() => privacyPolicyUrl ? void Linking.openURL(privacyPolicyUrl) : setMessage("Admin এখনো Privacy Policy link সেট করেননি।")} className={privacyPolicyUrl ? "font-bold text-primary underline" : "font-bold text-red-600"}>Privacy Policy</Text> ও নীতিমালার সঙ্গে একমত।
                    </Text>
                  </View>
                  <View className="flex-row gap-3">
                    <SecondaryButton label="পেছনে" onPress={() => setStep(3)} />
                    <PrimaryButton
                      label="সম্পন্ন করুন"
                      onPress={submitRegistration}
                      loading={loading}
                    />
                  </View>
                </>
              ) : null}
            </>
          ) : mode === "forgot" ? (
            <>
              <Text className="text-sm text-muted leading-5 mb-4">
                আপনার account-এর email দিন। আমরা password reset করার একটি link
                পাঠাব।
              </Text>
              <FieldLabel label="ইমেইল" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoComplete="email"
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                importantForAutofill="yes"
                placeholder="আপনার ইমেইল"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-border bg-surface px-4 py-4 text-foreground mb-5"
              />
              <PrimaryButton
                label="লিংক পাঠান"
                onPress={submitForgotPassword}
                loading={loading}
                compact
              />
              <TouchableOpacity
                className="mt-5 items-center"
                onPress={() => switchMode("login")}
              >
                <Text className="text-sm text-primary font-semibold">
                  লগইনে ফিরে যান
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <FieldLabel label="ইমেইল" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoComplete="username"
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="username"
                importantForAutofill="yes"
                placeholder="আপনার ইমেইল"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-border bg-surface px-4 py-4 text-foreground mb-4"
              />
              <FieldLabel label="Password" />
              <View className="flex-row items-center rounded-2xl border border-border bg-surface px-4">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="আপনার password"
                  placeholderTextColor="#94A3B8"
                  autoComplete="current-password"
                  textContentType="password"
                  importantForAutofill="yes"
                  autoCapitalize="none"
                  className="flex-1 py-4 text-foreground"
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান"}
                  onPress={() => setShowPassword((value) => !value)}
                  className="p-2"
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={21}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                className="items-end mt-3"
                onPress={() => switchMode("forgot")}
              >
                <Text className="text-sm text-muted font-medium">
                  পাসওয়ার্ড ভুলে গেছেন?
                </Text>
              </TouchableOpacity>
              <PrimaryButton
                label="লগইন করুন"
                onPress={submitLogin}
                loading={loading}
              />
              <View className="flex-row items-center gap-3 my-5">
                <View className="h-px bg-border flex-1" />
                <Text className="text-xs text-muted font-bold">অথবা</Text>
                <View className="h-px bg-border flex-1" />
              </View>
              <TouchableOpacity
                disabled={isOAuthBusy}
                onPress={() => void handleOAuth("google")}
                className="rounded-2xl bg-surface border border-border py-3.5 items-center flex-row justify-center gap-3"
              >
                <Ionicons name="logo-google" size={20} color="#DB4437" />
                {oauthLoading === "google" ? (
                  <ActivityIndicator color="#15803D" />
                ) : (
                  <Text className="font-bold text-foreground">
                    Google দিয়ে লগইন করুন
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isOAuthBusy}
                onPress={() => void handleOAuth("facebook")}
                className="rounded-2xl bg-[#1877F2] py-3.5 items-center flex-row justify-center gap-3 mt-3"
              >
                <Ionicons name="logo-facebook" size={20} color="white" />
                {oauthLoading === "facebook" ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="font-bold text-white">
                    Facebook দিয়ে লগইন করুন
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                className="mt-6 items-center"
                onPress={() => switchMode("register")}
              >
                <Text className="text-sm text-primary font-semibold">
                  একাউন্ট নেই? রেজিস্ট্রেশন করুন
                </Text>
              </TouchableOpacity>
            </>
          )}
          {message ? (
            <Text className="text-sm text-error text-center leading-5 mt-4">
              {message}
            </Text>
          ) : null}
        </ScrollView>
        <Modal transparent visible={locationPicker !== null} animationType="slide" onRequestClose={() => setLocationPicker(null)}>
          <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setLocationPicker(null)}>
            <Pressable className="max-h-[75%] rounded-t-3xl bg-background p-5" onPress={(event) => event.stopPropagation()}>
              <View className="flex-row items-center justify-between mb-4"><Text className="text-lg font-bold text-foreground">{locationPicker === "union" ? "ইউনিয়ন বেছে নিন" : "গ্রাম/মহল্লা বেছে নিন"}</Text><TouchableOpacity onPress={() => setLocationPicker(null)}><Ionicons name="close" size={24} color="#94A3B8" /></TouchableOpacity></View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {(locationPicker === "union" ? unionOptions : villages).map((item) => {
                  const selected = locationPicker === "union" ? union === item : village === item;
                  return <TouchableOpacity key={item} className={`flex-row items-center rounded-2xl px-4 py-4 mb-2 ${selected ? "bg-green-50 border border-green-200" : "bg-surface border border-border"}`} onPress={() => { if (locationPicker === "union") { setUnion(item); setVillage(""); } else setVillage(item); setLocationPicker(null); }}><Text className="flex-1 text-sm font-medium text-foreground">{locationPicker === "union" ? (unionLabels[item] || item) : item}</Text>{selected ? <Ionicons name="checkmark-circle" size={20} color="#15803D" /> : null}</TouchableOpacity>;
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <Text className="text-sm font-semibold text-foreground mb-2">{label}</Text>
  );
}
function PrimaryButton({
  label,
  onPress,
  loading = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      className={compact ? "self-stretch rounded-xl bg-primary px-5 py-3 items-center" : "rounded-2xl bg-primary py-4 items-center flex-1"}
      onPress={onPress}
      disabled={loading}
    >
      <Text className="text-base font-bold text-white">
        {loading ? "অপেক্ষা করুন..." : label}
      </Text>
    </TouchableOpacity>
  );
}
function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className="rounded-2xl bg-surface border border-border py-4 items-center w-1/3"
      onPress={onPress}
    >
      <Text className="text-base font-bold text-foreground">{label}</Text>
    </TouchableOpacity>
  );
}
