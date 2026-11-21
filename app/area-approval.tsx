import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { onValue, ref, update } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { uploadImageFromUri } from "@/lib/media-upload";
import { pathargataAuth, pathargataDb, pathargataFunctions } from "@/lib/pathargata-firebase";
import { detectPathargataArea } from "@/lib/area-access";
import { clearLocalAreaVerification, markLocalAreaVerified } from "@/lib/local-area-unlock";

type Profile = {
  name?: string;
  email?: string;
  union?: string;
  village?: string;
  accountAccess?: string;
  accessReview?: string;
  accessReason?: string;
  status?: string;
  nid_url?: string;
  selfie_url?: string;
  nid_front_url?: string;
  nid_back_url?: string;
};

type VerificationImageKey = "selfie" | "nidFront" | "nidBack";
type VerificationImages = Record<VerificationImageKey, string | null>;

const IMAGE_FIELDS: { key: VerificationImageKey; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "selfie", title: "নিজের ছবি / Selfie", hint: "মুখ পরিষ্কার দেখা যায় এমন ছবি", icon: "person-circle-outline" },
  { key: "nidFront", title: "NID Front Side", hint: "NID card-এর সামনের দিক", icon: "card-outline" },
  { key: "nidBack", title: "NID Back Side", hint: "NID card-এর পেছনের দিক", icon: "card-outline" },
];

function reasonText(reason?: string) {
  if (reason === "outside_area") return "আপনার বর্তমান GPS location পাথরঘাটা এলাকার নির্ধারিত সীমানার বাইরে।";
  if (reason === "permission_denied") return "GPS permission পাওয়া যায়নি। নিরাপত্তার জন্য account review প্রয়োজন।";
  return "আপনার location নিশ্চিত করা যায়নি। NID যাচাইয়ের পর account চালু করা হবে।";
}

function safeSupportLink(value: unknown, platform: "whatsapp" | "telegram") {
  try {
    const url = new URL(String(value || "").trim());
    const allowedHosts = platform === "whatsapp"
      ? ["wa.me", "api.whatsapp.com", "chat.whatsapp.com"]
      : ["t.me", "telegram.me"];
    if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname.toLowerCase())) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function openSupportLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("লিংক খোলা যায়নি", "পরে আবার চেষ্টা করুন অথবা অন্য যোগাযোগের মাধ্যম ব্যবহার করুন।");
  }
}

export default function AreaApprovalScreen() {
  const user = pathargataAuth.currentUser;
  const [profile, setProfile] = useState<Profile>({});
  const [images, setImages] = useState<VerificationImages>({ selfie: null, nidFront: null, nidBack: null });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [telegramLink, setTelegramLink] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        router.replace("/auth");
        return;
      }
      const stopProfile = onValue(
        ref(pathargataDb, `users/${user.uid}`),
        (snapshot) => {
          const nextProfile = (snapshot.val() || {}) as Profile;
          setProfile(nextProfile);
          setSubmitted(Boolean(nextProfile.nid_front_url));
        },
        () => setMessage("Account status লোড করা যায়নি। Retry করুন।"),
      );
      const stopWhatsApp = onValue(
        ref(pathargataDb, "admin_settings/whatsapp_link"),
        (snapshot) => setWhatsappLink(safeSupportLink(snapshot.val(), "whatsapp")),
        () => setWhatsappLink(""),
      );
      const stopTelegram = onValue(
        ref(pathargataDb, "admin_settings/telegram_link"),
        (snapshot) => setTelegramLink(safeSupportLink(snapshot.val(), "telegram")),
        () => setTelegramLink(""),
      );
      return () => {
        stopProfile();
        stopWhatsApp();
        stopTelegram();
      };
    }, [user]),
  );

  async function chooseImage(key: VerificationImageKey) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("ছবি বাছতে photo permission প্রয়োজন।");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled) {
      setImages((current) => ({ ...current, [key]: result.assets[0]?.uri || null }));
      setMessage("");
    }
  }

  async function submitReview() {
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (submitted) {
      setMessage("আপনার verification request ইতিমধ্যে জমা হয়েছে। Admin review শেষ হওয়া পর্যন্ত আবার পাঠানোর প্রয়োজন নেই।");
      return;
    }
    if (!images.selfie || !images.nidFront || !images.nidBack) {
      Alert.alert("তিনটি ছবি প্রয়োজন", "নিজের ছবি এবং NID card-এর front ও back side—তিনটিই দিন।");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const upload = async (key: VerificationImageKey, label: string) => {
        const sanitized = await ImageManipulator.manipulateAsync(
          images[key] as string,
          [{ resize: { width: key === "selfie" ? 1200 : 1800 } }],
          { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
        );
        return uploadImageFromUri(sanitized.uri, "image/jpeg", undefined, label);
      };
      setMessage("ছবি ১/৩ আপলোড হচ্ছে…");
      const selfie = await upload("selfie", "নিজের ছবি");
      setMessage("ছবি ২/৩ আপলোড হচ্ছে…");
      const nidFront = await upload("nidFront", "NID Front");
      setMessage("ছবি ৩/৩ আপলোড হচ্ছে…");
      const nidBack = await upload("nidBack", "NID Back");
      setMessage("সার্ভারে verification request জমা হচ্ছে…");
      const submit = httpsCallable<{ selfieUrl: string; nidFrontUrl: string; nidBackUrl: string }, { status: string }>(pathargataFunctions, "submitAreaAccessRequest");
      await submit({ selfieUrl: selfie.url, nidFrontUrl: nidFront.url, nidBackUrl: nidBack.url });
      setImages({ selfie: null, nidFront: null, nidBack: null });
      setSubmitted(true);
      setMessage("তিনটি ছবি জমা হয়েছে। Admin যাচাই শেষ হলে account খুলে দেওয়া হবে।");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NID জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSaving(false);
    }
  }

  async function reactivateAccount() {
    if (!user || profile.status !== "deactivated") return;
    setSaving(true);
    setMessage("");
    const now = Date.now();
    try {
      await update(ref(pathargataDb), {
        [`users/${user.uid}/status`]: "user",
        [`users/${user.uid}/deactivated_at`]: null,
        [`users/${user.uid}/deletion_due_at`]: null,
        [`account_lifecycle_requests/${user.uid}`]: {
          uid: user.uid,
          action: "reactivate",
          requestedAt: now,
        },
      });
      setMessage("Account পুনরায় সক্রিয় হয়েছে। এখন App-এ প্রবেশ করতে পারবেন।");
      router.replace("/(tabs)" as any);
    } catch {
      setMessage("৩০ দিনের grace period শেষ হয়ে গেলে account পুনরায় সক্রিয় করা যাবে না।");
    } finally {
      setSaving(false);
    }
  }

  async function recheckLocation() {
    if (!user || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const area = await detectPathargataArea();
      if (area.reason === "inside_area") {
        markLocalAreaVerified(user.uid);
        setMessage("আপনার অবস্থান পাথরঘাটা এলাকার মধ্যে পাওয়া গেছে। Home page খোলা হচ্ছে…");
        router.replace("/(tabs)" as any);
        return;
      }
      clearLocalAreaVerification(user.uid);
      if (area.reason === "outside_area") {
        setMessage("আপনি বর্তমানে পাথরঘাটা এলাকার বাইরে আছেন। এলাকার ভিতর থেকে আবার চেষ্টা করুন।");
      } else if (area.reason === "permission_denied") {
        setMessage("Location permission বন্ধ আছে। আগে Location Settings থেকে এটি চালু করুন।");
      } else {
        setMessage("বর্তমান location পাওয়া যায়নি। Location চালু করে আবার চেষ্টা করুন।");
      }
    } catch {
      clearLocalAreaVerification(user.uid);
      setMessage("Location check করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSaving(false);
    }
  }

  async function openLocationSettings() {
    try {
      await Linking.openSettings();
    } catch {
      setMessage("Location Settings খোলা যায়নি। ফোনের Settings থেকে Pathargata Digital-এর Location permission চালু করুন।");
    }
  }

  const approved = profile.accountAccess === "approved" || profile.accessReview === "approved";
  const pending = profile.accessReview === "pending" || profile.status === "pending_review";
  const deactivated = profile.status === "deactivated";

  return (
    <ScreenContainer className="bg-[#F4FAF6]">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <View className="items-center pt-8">
          <View className={`h-20 w-20 items-center justify-center rounded-[28px] ${approved ? "bg-green-100" : "bg-amber-100"}`}>
            <Ionicons name={approved ? "checkmark-circle" : "shield-checkmark-outline"} size={42} color={approved ? "#15803D" : "#B45309"} />
          </View>
          <Text className="mt-5 text-center text-2xl font-extrabold text-[#17372A]">এলাকা যাচাই প্রয়োজন</Text>
          <Text className="mt-2 text-center text-[15px] leading-5 text-[#64756A]">পাথরঘাটা ডিজিটাল account নিরাপদ ও স্থানীয় রাখার জন্য registration location যাচাই করা হয়।</Text>
        </View>

        <View className={`mt-6 rounded-3xl border p-5 ${approved ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <View className="flex-row items-center">
            <Ionicons name={approved ? "lock-open-outline" : "lock-closed-outline"} size={20} color={approved ? "#15803D" : "#B45309"} />
            <Text className={`ml-2 text-base font-extrabold ${approved ? "text-green-900" : "text-amber-900"}`}>{approved ? "Account approved" : pending ? "Account review-এ আছে" : "Account সাময়িকভাবে locked"}</Text>
          </View>
          <Text className={`mt-3 text-[14px] leading-5 ${approved ? "text-green-800" : "text-amber-800"}`}>{approved ? "আপনার account এখন ব্যবহার করা যাবে।" : reasonText(profile.accessReason)}</Text>
        </View>

        {!approved && !deactivated ? <View className="mt-5 rounded-3xl border border-[#DCE9DF] bg-white p-5">
          <Text className="text-base font-extrabold text-[#17372A]">আবার location যাচাই করুন</Text>
          <Text className="mt-2 text-[13px] leading-5 text-[#748278]">ভুল করে Location বন্ধ হয়ে গেলে এটি চালু করে আবার চেষ্টা করুন। আপনি পাথরঘাটা এলাকার ভিতরে থাকলে Home page খুলবে।</Text>
          <TouchableOpacity onPress={() => void recheckLocation()} disabled={saving} className="mt-4 flex-row items-center justify-center rounded-2xl bg-[#15803D] px-3 py-3.5">
            {saving ? <ActivityIndicator color="white" /> : <Ionicons name="location-outline" size={19} color="white" />}
            <Text className="ml-2 text-[13px] font-extrabold text-white">আবার এলাকা যাচাই করুন</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void openLocationSettings()} disabled={saving} className="mt-3 items-center rounded-2xl border border-[#9AC8A9] bg-[#F4FBF6] px-3 py-3.5">
            <Text className="text-[13px] font-extrabold text-[#15803D]">Location Settings খুলুন</Text>
          </TouchableOpacity>
          <Text className="text-base font-extrabold text-[#17372A]">প্রশাসকের সঙ্গে যোগাযোগ করুন</Text>
          <Text className="mt-2 text-[13px] leading-5 text-[#748278]">লোকেশন যাচাই বা account approval নিয়ে সাহায্য প্রয়োজন হলে সরাসরি যোগাযোগ করুন।</Text>
          <View className="mt-4 flex-row gap-3">
            {whatsappLink ? <TouchableOpacity onPress={() => void openSupportLink(whatsappLink)} className="flex-1 flex-row items-center justify-center rounded-2xl bg-[#168A4A] px-3 py-3.5">
              <Ionicons name="logo-whatsapp" size={19} color="white" /><Text className="ml-2 text-[13px] font-extrabold text-white">WhatsApp</Text>
            </TouchableOpacity> : null}
            {telegramLink ? <TouchableOpacity onPress={() => void openSupportLink(telegramLink)} className="flex-1 flex-row items-center justify-center rounded-2xl bg-[#168BC1] px-3 py-3.5">
              <Ionicons name="paper-plane-outline" size={19} color="white" /><Text className="ml-2 text-[13px] font-extrabold text-white">Telegram</Text>
            </TouchableOpacity> : null}
          </View>
          {!whatsappLink && !telegramLink ? <Text className="mt-3 text-[12px] leading-5 text-[#8A7560]">প্রশাসকের যোগাযোগের লিংক এখনো সেট করা হয়নি।</Text> : null}
        </View> : null}

        {deactivated ? <View className="mt-5 rounded-3xl border border-blue-200 bg-blue-50 p-5">
          <Text className="text-base font-extrabold text-blue-900">Account deactivated</Text>
          <Text className="mt-2 text-[13px] leading-5 text-blue-800">৩০ দিনের grace period শেষ হওয়ার আগে চাইলে account পুনরায় সক্রিয় করতে পারবেন।</Text>
          <TouchableOpacity onPress={() => void reactivateAccount()} disabled={saving} className="mt-4 items-center rounded-2xl bg-blue-600 py-4">
            {saving ? <ActivityIndicator color="white" /> : <Text className="font-extrabold text-white">Account পুনরায় সক্রিয় করুন</Text>}
          </TouchableOpacity>
        </View> : !approved ? <>
          <View className="mt-5 rounded-3xl border border-[#E1EAE3] bg-white p-5">
            <Text className="text-base font-extrabold text-[#17372A]">Admin approval-এর জন্য ৩টি ছবি দিন</Text>
            <Text className="mt-2 text-[13px] leading-5 text-[#748278]">নিজের ছবি এবং NID card-এর front ও back side পরিষ্কারভাবে দিন। Upload-এর আগে ছবির metadata সরিয়ে size কমানো হবে।</Text>
            {IMAGE_FIELDS.map(({ key, title, hint, icon }) => (
              <TouchableOpacity key={key} onPress={() => void chooseImage(key)} disabled={saving || submitted} className="mt-4 flex-row items-center overflow-hidden rounded-2xl border-2 border-dashed border-[#9AC8A9] bg-[#F4FBF6] p-3">
                <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-[#E5F3E8]">
                  {images[key] ? <Image source={{ uri: images[key] as string }} className="h-full w-full" resizeMode="cover" /> : <Ionicons name={icon} size={34} color="#15803D" />}
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[14px] font-extrabold text-[#17372A]">{title}</Text>
                  <Text className="mt-1 text-[12px] text-[#748278]">{images[key] ? "ছবি নির্বাচিত হয়েছে · বদলাতে ট্যাপ করুন" : hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6C8D78" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => void submitReview()} disabled={saving || submitted} className={`mt-5 items-center rounded-2xl py-4 ${submitted ? "bg-[#8AAE95]" : "bg-[#15803D]"}`}>
              {saving ? <ActivityIndicator color="white" /> : <Text className="text-[15px] font-extrabold text-white">{submitted ? "Verification request জমা হয়েছে" : "৩টি ছবি দিয়ে approval request পাঠান"}</Text>}
            </TouchableOpacity>
          </View>
          {profile.nid_url || profile.nid_front_url ? <View className="mt-3 rounded-2xl bg-blue-50 px-4 py-3"><Text className="text-[13px] font-bold leading-5 text-blue-800">আপনার verification-এর ছবি আগে জমা আছে। Admin review শেষ না হওয়া পর্যন্ত নতুন করে পাঠানোর প্রয়োজন নেই।</Text></View> : null}
        </> : null}

        {message ? <View className="mt-4 rounded-2xl bg-white px-4 py-3"><Text className="text-center text-[13px] leading-5 text-[#315B46]">{message}</Text></View> : null}
        {approved ? <TouchableOpacity onPress={() => router.replace("/(tabs)" as any)} className="mt-5 items-center rounded-2xl bg-[#15803D] py-4"><Text className="font-extrabold text-white">App-এ প্রবেশ করুন</Text></TouchableOpacity> : null}
        <TouchableOpacity onPress={() => void pathargataAuth.signOut()} className="mt-5 py-3"><Text className="text-center text-[14px] font-bold text-[#748278]">অন্য account দিয়ে লগইন করুন</Text></TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
