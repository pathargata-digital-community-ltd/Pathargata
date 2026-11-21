import { safeGoBack } from "@/lib/safe-navigation";
import { onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { ref, set, update } from "firebase/database";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ProfessionVerificationBadge, VERIFICATION_CATEGORIES, getVerificationCategory, type VerificationCategoryId } from "@/components/profession-verification-badge";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { uploadImageFromUri } from "@/lib/media-upload";

type Plan = { id: string; name: string; price: number | string; duration: number | string; trial?: boolean };
type PaymentMethod = "bKash" | "Nagad" | "Rocket";
type UserProfile = { name?: string; isVerified?: boolean; verificationStatus?: string; verificationCategory?: string; verificationExpiry?: number };
const DEFAULT_PLANS: Plan[] = [
  { id: "p1", name: "Starter", price: 100, duration: 30 },
  { id: "p2", name: "Pro", price: 500, duration: 180 },
  { id: "p3", name: "Yearly", price: 900, duration: 365 },
];
const PAYMENT_METHODS: { id: PaymentMethod; title: string; subtitle: string; color: string; background: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "bKash", title: "bKash", subtitle: "Send Money", color: "#C2185B", background: "#FFF0F6", icon: "phone-portrait-outline" },
  { id: "Nagad", title: "Nagad", subtitle: "Send Money", color: "#E65C16", background: "#FFF4EA", icon: "wallet-outline" },
  { id: "Rocket", title: "Rocket", subtitle: "Send Money", color: "#7B3FA1", background: "#F6F0FA", icon: "rocket-outline" },
];
const EMPTY_PAYMENT_NUMBERS: Record<PaymentMethod, string> = { bKash: "", Nagad: "", Rocket: "" };

function normalizeBanglaDigits(value: string) {
  return value.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}
function normalizePhone(value: string) {
  return normalizeBanglaDigits(value).replace(/\D/g, "");
}
function formatPrice(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("bn-BD") : String(value);
}

export default function VerificationScreen() {
  const user = pathargataAuth.currentUser;
  const [profile, setProfile] = useState<UserProfile>({});
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [paymentNumbers, setPaymentNumbers] = useState<Record<PaymentMethod, string>>(EMPTY_PAYMENT_NUMBERS);
  const [category, setCategory] = useState<VerificationCategoryId | "">("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [senderNumber, setSenderNumber] = useState("");
  const [trxId, setTrxId] = useState("");
  const [nid, setNid] = useState("");
  const [doc, setDoc] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    const userListener = onValue(ref(pathargataDb, `users/${user.uid}`), (snapshot) => setProfile((snapshot.val() || {}) as UserProfile));
    const plansListener = onValue(ref(pathargataDb, "admin_settings/verification_plans"), (snapshot) => {
      const raw = snapshot.val();
      if (!raw || typeof raw !== "object") { setPlans(DEFAULT_PLANS); return; }
      const next = Object.entries(raw as Record<string, Omit<Plan, "id">>).map(([id, value]) => ({ id, ...value }));
      setPlans(next.length ? next : DEFAULT_PLANS);
    });
    const paymentsListener = onValue(ref(pathargataDb, "admin_settings/verification_payment_numbers"), (snapshot) => {
      const raw = snapshot.val() || {};
      setPaymentNumbers({
        bKash: typeof raw.bKash === "string" ? raw.bKash.trim() : "",
        Nagad: typeof raw.Nagad === "string" ? raw.Nagad.trim() : "",
        Rocket: typeof raw.Rocket === "string" ? raw.Rocket.trim() : "",
      });
    });
    return () => { userListener(); plansListener(); paymentsListener(); };
  }, [user]));

  async function choose(kind: "doc" | "photo") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("অনুমতি প্রয়োজন", "ছবি বাছতে gallery permission দিন।");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.8 });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri || null;
    if (kind === "doc") setDoc(uri);
    else setPhoto(uri);
  }

  async function copyReceiverNumber() {
    if (!method || !paymentNumbers[method]) {
      Alert.alert("নম্বর পাওয়া যায়নি", "অ্যাডমিন এখনো এই পেমেন্ট মেথডের নম্বর সেট করেননি।");
      return;
    }
    await Clipboard.setStringAsync(paymentNumbers[method]);
    Alert.alert("নম্বর কপি হয়েছে", `${method} নম্বরটি কপি করা হয়েছে। এখন আপনার ওয়ালেট অ্যাপ থেকে Send Money করুন।`);
  }

  async function submit() {
    if (!user) { router.push("/auth"); return; }
    const cleanSenderNumber = normalizePhone(senderNumber);
    const cleanNid = normalizeBanglaDigits(nid).replace(/\D/g, "");
    const cleanTrxId = trxId.trim();
    const receiverNumber = method ? paymentNumbers[method] : "";
    if (!category || !plan || !method || !receiverNumber || !cleanSenderNumber || !cleanTrxId || !cleanNid || !doc || !photo) {
      Alert.alert("তথ্য অসম্পূর্ণ", "ক্যাটাগরি, প্ল্যান, পেমেন্ট মেথড, প্রেরকের নম্বর, TrxID, NID এবং প্রয়োজনীয় ছবি দিন।");
      return;
    }
    if (!/^01[3-9][0-9]{8}$/.test(cleanSenderNumber)) {
      Alert.alert("মোবাইল নম্বর যাচাই করুন", "যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।");
      return;
    }
    if (!/^\d{10,17}$/.test(cleanNid)) {
      Alert.alert("NID নম্বর যাচাই করুন", "১০, ১৩ অথবা ১৭ সংখ্যার NID নম্বর দিন।");
      return;
    }
    if (cleanTrxId.length < 3 || cleanTrxId.length > 80) {
      Alert.alert("TrxID যাচাই করুন", "সঠিক Transaction ID দিন।");
      return;
    }

    setSaving(true);
    try {
      const [docUpload, photoUpload] = await Promise.all([uploadImageFromUri(doc), uploadImageFromUri(photo)]);
      await set(ref(pathargataDb, `verification_requests/${user.uid}`), {
        uid: user.uid,
        name: profile.name || user.displayName || "User",
        planId: plan.id,
        paymentMethod: method,
        paymentNumber: cleanSenderNumber,
        receiverNumber,
        trxId: cleanTrxId,
        category,
        nid: cleanNid,
        docImage: docUpload.url,
        userImage: photoUpload.url,
        timestamp: Date.now(),
        status: "pending",
      });
      await update(ref(pathargataDb, `users/${user.uid}`), { verificationStatus: "pending" });
      setProfile((current) => ({ ...current, verificationStatus: "pending" }));
      Alert.alert("আবেদন জমা হয়েছে", "পেমেন্ট ও পরিচয়ের তথ্য অ্যাডমিন যাচাই করবেন। যাচাই শেষে আপনার পেশাভিত্তিক badge চালু হবে।");
    } catch (error) {
      Alert.alert("আবেদন জমা হয়নি", error instanceof Error ? error.message : "আবার চেষ্টা করুন।");
    } finally {
      setSaving(false);
    }
  }

  const status = profile.verificationStatus || "none";
  const approved = profile.isVerified === true || status === "approved";
  const pending = status === "pending";
  const visibleCategory = category || profile.verificationCategory || "";
  const selectedCategory = getVerificationCategory(visibleCategory || undefined);
  const selectedReceiver = method ? paymentNumbers[method] : "";
  const canApply = Boolean(user && !approved && !pending);

  return (
    <ScreenContainer className="bg-[#F4F7F6]">
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 44 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => safeGoBack("/(tabs)")} accessibilityRole="button" accessibilityLabel="ফিরে যান" className="h-11 w-11 items-center justify-center rounded-2xl border border-[#DFE8E2] bg-white">
          <Ionicons name="arrow-back" size={20} color="#244C3D" />
        </TouchableOpacity>

        <LinearGradient colors={["#0B4435", "#13795C", "#1A9170"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="mt-4 overflow-hidden rounded-[28px] p-5">
          <View className="absolute -right-6 -top-8 h-36 w-36 rounded-full bg-white/10" />
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <View className="self-start rounded-full border border-white/20 bg-white/10 px-3 py-1"><Text className="text-[9px] font-black uppercase tracking-[1.3px] text-emerald-50">PATHARGATA · VERIFIED</Text></View>
              <Text className="mt-3 text-[25px] font-black leading-8 text-white">প্রোফাইল যাচাই</Text>
              <Text className="mt-1.5 text-[13px] leading-5 text-emerald-50">পেশা ও পরিচয়ের সঙ্গে মানানসই badge নিন, কমিউনিটিতে আপনার বিশ্বাসযোগ্যতা বাড়ান।</Text>
            </View>
            <View className="h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10"><Ionicons name="shield-checkmark" size={26} color="#D6F8E9" /></View>
          </View>
          <View className="mt-4 flex-row items-center gap-2"><View className="h-1.5 flex-1 rounded-full bg-white/25"><View className="h-full w-1/3 rounded-full bg-[#D5F3A6]" /></View><Text className="text-[10px] font-bold text-emerald-50">পরিচয় · পেশা · পেমেন্ট</Text></View>
        </LinearGradient>

        {!user ? (
          <View className="mt-4 flex-row items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Ionicons name="lock-closed-outline" size={19} color="#A45B13" />
            <View className="flex-1"><Text className="text-[13px] font-extrabold text-amber-900">আবেদন করতে লগইন করুন</Text><Text className="mt-1 text-[12px] leading-5 text-amber-800">এই preview-তে badge-এর নকশা দেখা যাচ্ছে। আবেদন, পেমেন্ট নম্বর ও প্ল্যান দেখতে অ্যাকাউন্টে লগইন করুন।</Text><TouchableOpacity onPress={() => router.push("/auth")} className="mt-3 self-start rounded-xl bg-[#166347] px-4 py-2"><Text className="text-[12px] font-extrabold text-white">লগইন করুন</Text></TouchableOpacity></View>
          </View>
        ) : approved ? (
          <View className="mt-4 rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
            <View className="flex-row items-center gap-3"><View className="h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50"><Ionicons name="checkmark-done-circle" size={27} color="#138259" /></View><View className="flex-1"><Text className="text-[15px] font-black text-[#174C39]">আপনার প্রোফাইল যাচাইকৃত</Text><Text className="mt-0.5 text-[11px] text-[#6D7D73]">অ্যাডমিন অনুমোদিত পেশাভিত্তিক badge</Text></View></View>
            <View className="mt-4 items-start rounded-2xl bg-[#F4F9F5] p-4"><ProfessionVerificationBadge category={profile.verificationCategory} size="large" /><Text className="mt-3 text-[11px] font-semibold text-[#64756B]">{selectedCategory.title}</Text></View>
            {profile.verificationExpiry ? <Text className="mt-3 text-[11px] text-[#7A887F]">মেয়াদ শেষ: {new Date(profile.verificationExpiry).toLocaleDateString("bn-BD")}</Text> : null}
          </View>
        ) : pending ? (
          <View className="mt-4 rounded-3xl border border-amber-200 bg-white p-5 shadow-sm"><View className="flex-row items-center gap-3"><View className="h-11 w-11 items-center justify-center rounded-2xl bg-amber-50"><Ionicons name="time-outline" size={25} color="#B56A17" /></View><View className="flex-1"><Text className="text-[15px] font-black text-amber-900">আবেদন পর্যালোচনায়</Text><Text className="mt-1 text-[12px] leading-5 text-amber-800">আপনার পেমেন্ট রেফারেন্স ও পরিচয়ের নথি অ্যাডমিন যাচাই করছেন। অনুমোদনের পর নির্বাচিত badge দেখা যাবে।</Text></View></View></View>
        ) : null}

        <View className="mt-6 flex-row items-end justify-between"><View><Text className="text-[18px] font-black text-[#183A2F]">আপনার ক্যাটাগরি</Text><Text className="mt-1 text-[12px] text-[#738178]">প্রতিটি পেশার জন্য আলাদা 3D badge preview</Text></View><View className="rounded-full bg-[#E6F1E9] px-2.5 py-1"><Text className="text-[10px] font-extrabold text-[#25634A]">{VERIFICATION_CATEGORIES.length} ক্যাটাগরি</Text></View></View>
        {visibleCategory ? <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-[#DDE9DF] bg-white p-4"><View className="flex-1 pr-2"><Text className="text-[10px] font-extrabold uppercase tracking-[1px] text-[#829087]">ব্যাজের preview</Text><Text className="mt-1 text-[14px] font-extrabold text-[#204635]">{selectedCategory.title}</Text><Text className="mt-1 text-[11px] leading-4 text-[#748178]">এই ক্যাটাগরির অনুমোদিত সদস্যরা এই badge পাবেন।</Text></View><ProfessionVerificationBadge category={visibleCategory} size="large" /></View> : null}

        <View className="mt-3 gap-2.5">
          {VERIFICATION_CATEGORIES.map((item) => {
            const selected = visibleCategory === item.id;
            const locked = Boolean(user && (approved || pending));
            return (
              <TouchableOpacity key={item.id} onPress={() => setCategory(item.id)} disabled={locked} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected }} className={`flex-row items-center gap-3 rounded-2xl border p-3.5 ${selected ? "border-[#278264] bg-[#F0F8F2]" : "border-[#E1E9E3] bg-white"}`}>
                <View className="min-w-0 flex-1"><View className="flex-row items-center gap-2"><Text className="text-[14px] font-extrabold text-[#244638]">{item.title}</Text>{selected ? <Ionicons name="checkmark-circle" size={17} color="#16805D" /> : null}</View><Text className="mt-1 text-[11px] leading-4 text-[#748178]">{item.description}</Text></View>
                <ProfessionVerificationBadge category={item.id} size="medium" />
              </TouchableOpacity>
            );
          })}
        </View>

        {!user ? <View className="mt-6 rounded-3xl border border-[#DFE8E2] bg-white p-4"><Text className="text-[15px] font-black text-[#183A2F]">পেমেন্ট পদ্ধতি</Text><Text className="mt-1 text-[11px] leading-4 text-[#738178]">লগইন করলে অ্যাডমিন সেট করা প্রাপকের নম্বর দেখা যাবে।</Text><View className="mt-3 flex-row gap-2">{PAYMENT_METHODS.map((item) => <View key={item.id} className="min-h-[68px] flex-1 items-center justify-center rounded-2xl border border-[#E7ECE8] bg-[#FAFCFA] px-1.5 py-2"><View style={{ width: 27, height: 27, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: item.background }}><Ionicons name={item.icon} size={15} color={item.color} /></View><Text style={{ marginTop: 5, fontSize: 10, fontWeight: "900", color: "#2D4539" }}>{item.title}</Text></View>)}</View></View> : null}

        {canApply ? (
          <>
            <View className="mt-7 flex-row items-end justify-between"><View><Text className="text-[18px] font-black text-[#183A2F]">Verification plan</Text><Text className="mt-1 text-[12px] text-[#738178]">প্রযোজ্য মেয়াদ ও মূল্য বেছে নিন</Text></View><Ionicons name="receipt-outline" size={20} color="#267150" /></View>
            <View className="mt-3 gap-2.5">
              {plans.map((item) => {
                const selected = plan?.id === item.id;
                return <TouchableOpacity key={item.id} onPress={() => setPlan(item)} activeOpacity={0.85} className={`flex-row items-center rounded-2xl border p-4 ${selected ? "border-[#278264] bg-[#F0F8F2]" : "border-[#E1E9E3] bg-white"}`}>
                  <View className={`mr-3 h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-[#17805D] bg-[#17805D]" : "border-[#B9C8BE] bg-white"}`}>{selected ? <Ionicons name="checkmark" size={13} color="white" /> : null}</View>
                  <View className="flex-1"><Text className="text-[14px] font-extrabold text-[#244638]">{item.name}</Text><Text className="mt-1 text-[11px] text-[#738178]">{item.duration} দিনের জন্য verification</Text></View>
                  <Text className="text-[15px] font-black text-[#137252]">৳ {formatPrice(item.price)}</Text>
                </TouchableOpacity>;
              })}
            </View>

            <View className="mt-7 flex-row items-end justify-between"><View><Text className="text-[18px] font-black text-[#183A2F]">পেমেন্ট মেথড</Text><Text className="mt-1 text-[12px] text-[#738178]">যে ওয়ালেট থেকে পাঠাতে চান সেটি বাছুন</Text></View><Ionicons name="wallet-outline" size={20} color="#267150" /></View>
            <View className="mt-3 flex-row gap-2.5">
              {PAYMENT_METHODS.map((item) => {
                const selected = method === item.id;
                const configured = Boolean(paymentNumbers[item.id]);
                return <TouchableOpacity key={item.id} onPress={() => setMethod(item.id)} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected }} className={`min-h-[90px] flex-1 items-center justify-center rounded-2xl border px-2 py-3 ${selected ? "border-[#278264] bg-[#F0F8F2]" : "border-[#E1E9E3] bg-white"}`}>
                  <View style={{ width: 31, height: 31, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: item.background }}><Ionicons name={item.icon} size={17} color={item.color} /></View>
                  <Text style={{ marginTop: 6, fontSize: 12, fontWeight: "900", color: selected ? "#17684C" : "#2D4539" }}>{item.title}</Text>
                  <Text className="mt-0.5 text-[9px] font-semibold text-[#7A887F]">{configured ? item.subtitle : "নম্বর সেট হয়নি"}</Text>
                </TouchableOpacity>;
              })}
            </View>

            {method ? <View className="mt-3 rounded-2xl border border-[#DDE9DF] bg-white p-4">
              <View className="flex-row items-center gap-3"><View className="h-10 w-10 items-center justify-center rounded-xl bg-[#EAF4ED]"><Ionicons name="arrow-up-circle-outline" size={22} color="#197451" /></View><View className="flex-1"><Text className="text-[10px] font-extrabold uppercase tracking-[0.8px] text-[#819087]">{method} · Send Money</Text><Text className="mt-0.5 text-[17px] font-black text-[#193C2F]">{selectedReceiver || "অ্যাডমিন নম্বর সেট করেননি"}</Text></View><TouchableOpacity onPress={() => void copyReceiverNumber()} disabled={!selectedReceiver} accessibilityLabel="প্রাপকের নম্বর কপি করুন" className={`h-10 w-10 items-center justify-center rounded-xl ${selectedReceiver ? "bg-[#EAF4ED]" : "bg-[#F1F3F2]"}`}><Ionicons name="copy-outline" size={18} color={selectedReceiver ? "#197451" : "#9BA59F"} /></TouchableOpacity></View>
              <View className="mt-3 rounded-xl bg-[#F5F8F6] px-3 py-2.5"><Text className="text-[11px] leading-4 text-[#617268]">উপরের নম্বরে Send Money করে, নিচে যে নম্বর থেকে পাঠিয়েছেন ও Transaction ID লিখুন। অ্যাডমিন পেমেন্ট মিলিয়ে আবেদন অনুমোদন করবেন।</Text></View>
            </View> : null}

            <Text className="mt-6 text-[18px] font-black text-[#183A2F]">পেমেন্ট ও পরিচয়ের তথ্য</Text>
            <Text className="mt-1 text-[12px] leading-5 text-[#738178]">PIN, OTP বা wallet password কখনো দেবেন না। শুধু প্রেরকের নম্বর ও TrxID দিন।</Text>
            <Field label="যে নম্বর থেকে টাকা পাঠিয়েছেন" value={senderNumber} onChangeText={setSenderNumber} placeholder="01XXXXXXXXX" keyboardType="phone-pad" icon="call-outline" />
            <Field label="Transaction ID (TrxID)" value={trxId} onChangeText={setTrxId} placeholder="পেমেন্টের TrxID" autoCapitalize="characters" icon="receipt-outline" />
            <Field label="NID নম্বর" value={nid} onChangeText={setNid} placeholder="১০, ১৩ অথবা ১৭ সংখ্যার NID" keyboardType="number-pad" icon="card-outline" />
            <View className="mt-4 flex-row gap-3"><UploadBox label="NID / পেশার প্রমাণ" uri={doc} onPress={() => void choose("doc")} /><UploadBox label="আপনার ছবি" uri={photo} onPress={() => void choose("photo")} /></View>
            <View className="mt-4 flex-row items-start gap-2 rounded-2xl border border-[#DBE9DE] bg-[#EEF7F0] p-3"><Ionicons name="shield-checkmark-outline" size={17} color="#26724F" /><Text className="flex-1 text-[10px] leading-4 text-[#52705E]">আপনার নথি শুধু পরিচয় যাচাইয়ের কাজে ব্যবহৃত হবে। পেমেন্ট স্বয়ংক্রিয়ভাবে নিশ্চিত হয় না—অ্যাডমিন TrxID মিলিয়ে সিদ্ধান্ত দেবেন।</Text></View>
            <TouchableOpacity onPress={() => void submit()} disabled={saving} activeOpacity={0.88} className={`mt-5 min-h-14 flex-row items-center justify-center gap-2 rounded-2xl px-4 ${saving ? "bg-[#749788]" : "bg-[#0D6044]"}`}>
              {saving ? <ActivityIndicator color="white" /> : <><Ionicons name="send-outline" size={18} color="white" /><Text className="text-[14px] font-black text-white">যাচাইয়ের আবেদন জমা দিন</Text></>}
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, icon, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "phone-pad" | "number-pad"; icon: keyof typeof Ionicons.glyphMap; autoCapitalize?: "none" | "sentences" | "words" | "characters" }) {
  return <View className="mt-3"><Text className="mb-1.5 text-[11px] font-extrabold text-[#586C60]">{label}</Text><View className="min-h-[52px] flex-row items-center rounded-2xl border border-[#DFE8E2] bg-white px-3.5"><Ionicons name={icon} size={18} color="#708178" /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#A3AEA7" keyboardType={keyboardType} autoCapitalize={autoCapitalize || "none"} className="ml-2.5 flex-1 py-3 text-[14px] font-semibold text-[#203D30]" /></View></View>;
}

function UploadBox({ label, uri, onPress }: { label: string; uri: string | null; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} accessibilityRole="button" className="h-28 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#B8CBBE] bg-white">
    {uri ? <><Image source={{ uri }} className="h-full w-full" resizeMode="cover" /><View className="absolute bottom-1.5 left-1.5 rounded-lg bg-black/55 px-2 py-1"><Text className="text-[9px] font-bold text-white">ছবি বদলান</Text></View></> : <><View className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4ED]"><Ionicons name="cloud-upload-outline" size={20} color="#347657" /></View><Text className="mt-2 text-center text-[10px] font-bold text-[#66776C]">{label}</Text></>}
  </TouchableOpacity>;
}
