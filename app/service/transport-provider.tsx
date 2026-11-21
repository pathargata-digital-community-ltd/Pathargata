import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { push, ref } from "firebase/database";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

const PROVIDER_TYPES = [
  { id: "rent_a_car", label: "রেন্ট-এ-কার", icon: "car-sport-outline" as const, color: "#7C3AED" },
  { id: "cng", label: "CNG", icon: "car-outline" as const, color: "#0F766E" },
  { id: "auto_rickshaw", label: "Auto Rickshaw", icon: "car-sport-outline" as const, color: "#D97706" },
  { id: "motorcycle", label: "Motorcycle", icon: "bicycle-outline" as const, color: "#2563EB" },
  { id: "bus", label: "Bus Service", icon: "bus-outline" as const, color: "#15803D" },
];

function Field({ label, placeholder, value, onChangeText, multiline = false, keyboardType = "default" }: { label: string; placeholder: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; keyboardType?: "default" | "phone-pad" }) {
  return <View className="mb-4"><Text className="mb-2 text-[14px] font-extrabold text-foreground">{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A3B8" keyboardType={keyboardType} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} className={`rounded-2xl border border-border bg-background px-4 py-3 text-[15px] text-foreground ${multiline ? "min-h-[100px]" : ""}`} /></View>;
}

export default function TransportProviderScreen() {
  const [providerType, setProviderType] = useState("cng");
  const [providerName, setProviderName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [fare, setFare] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const selected = PROVIDER_TYPES.find((item) => item.id === providerType) || PROVIDER_TYPES[1];

  function goBack() { if (router.canGoBack()) safeGoBack("/(tabs)"); else router.replace("/service/transport" as any); }
  async function submit() {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth" as any); return; }
    if (!providerName.trim() || !phone.trim() || !serviceArea.trim() || !details.trim()) { setMessage("নাম, যোগাযোগ নম্বর, service area এবং বিস্তারিত তথ্য পূরণ করুন।"); return; }
    setSaving(true); setMessage("");
    try {
      await push(ref(pathargataDb, "transport_provider_requests"), { providerType, providerTypeLabel: selected.label, providerName: providerName.trim(), phone: phone.trim(), whatsapp: whatsapp.trim(), serviceArea: serviceArea.trim(), vehicleInfo: vehicleInfo.trim(), fare: fare.trim(), details: details.trim(), uid: user.uid, author: user.displayName || "Pathargata user", status: "pending", timestamp: Date.now() });
      setSubmitted(true); setMessage("আপনার provider application গ্রহণ করা হয়েছে। Admin যাচাই করার পর তথ্য Transport directory-তে দেখা যাবে।");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Application পাঠানো যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।"); }
    finally { setSaving(false); }
  }

  return <ScreenContainer className="bg-background"><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"><View className="flex-row items-center"><TouchableOpacity onPress={goBack} className="h-10 w-10 items-center justify-center rounded-full bg-surface" accessibilityLabel="পরিবহন screen-এ ফিরে যান"><Ionicons name="arrow-back" size={21} color="#334155" /></TouchableOpacity><View className="ml-3 flex-1"><Text className="text-xl font-extrabold text-foreground">Provider application</Text><Text className="mt-1 text-xs text-muted">আপনার পরিবহন service directory-তে যুক্ত করুন</Text></View><Ionicons name="briefcase-outline" size={25} color="#0F766E" /></View><View className="mt-5 rounded-3xl bg-[#E8F5F1] p-5"><Text className="text-lg font-extrabold text-[#115E59]">আপনি কি পরিবহন service দেন?</Text><Text className="mt-2 text-[13px] leading-5 text-[#567168]">রেন্ট-এ-কার, CNG, Auto, Motorcycle বা Bus provider হিসেবে নিজের তথ্য পাঠান। Admin approval-এর পর তথ্য public directory-তে যুক্ত হবে।</Text></View><Text className="mb-3 mt-6 text-[15px] font-extrabold text-foreground">আপনার service কোনটি?</Text><View className="flex-row flex-wrap gap-2">{PROVIDER_TYPES.map((item) => <TouchableOpacity key={item.id} onPress={() => setProviderType(item.id)} className={`w-[31%] rounded-2xl border p-3 ${providerType === item.id ? "border-[#0F766E] bg-[#E8F5F1]" : "border-border bg-surface"}`}><View className="h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${item.color}18` }}><Ionicons name={item.icon} size={18} color={item.color} /></View><Text numberOfLines={1} className="mt-2 text-[12px] font-extrabold text-foreground">{item.label}</Text></TouchableOpacity>)}</View><View className="mt-6 rounded-3xl border border-border bg-surface p-4"><Field label="Provider / চালকের নাম *" placeholder="আপনার নাম বা প্রতিষ্ঠানের নাম" value={providerName} onChangeText={setProviderName} /><Field label="যোগাযোগ নম্বর *" placeholder="01XXXXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Field label="WhatsApp নম্বর" placeholder="যদি থাকে" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" /><Field label="Service area / route *" placeholder="যেমন: পাথরঘাটা সদর, কাকচিড়া, বরগুনা" value={serviceArea} onChangeText={setServiceArea} /><Field label="গাড়ি / vehicle information" placeholder="মডেল, নম্বর বা আসন সংখ্যা" value={vehicleInfo} onChangeText={setVehicleInfo} /><Field label="আনুমানিক ভাড়া" placeholder="যেমন: ৳৮০–১৫০ বা আলোচনা সাপেক্ষে" value={fare} onChangeText={setFare} /><Field label="বিস্তারিত তথ্য *" placeholder="সময়, availability, route, booking নিয়ম ইত্যাদি লিখুন" value={details} onChangeText={setDetails} multiline /><TouchableOpacity onPress={() => void submit()} disabled={saving || submitted} className="items-center rounded-2xl py-4" style={{ backgroundColor: submitted ? "#94A3B8" : selected.color }}>{saving ? <ActivityIndicator color="white" /> : <Text className="text-[15px] font-extrabold text-white">{submitted ? "Application পাঠানো হয়েছে" : "Application পাঠান"}</Text>}</TouchableOpacity>{message ? <View className={`mt-3 rounded-2xl px-3 py-3 ${message.includes("গ্রহণ") ? "bg-green-50" : "bg-red-50"}`}><Text className={`text-center text-[13px] leading-4 ${message.includes("গ্রহণ") ? "text-green-800" : "text-red-800"}`}>{message}</Text></View> : null}</View><TouchableOpacity onPress={() => router.replace("/service/transport" as any)} className="mt-4 py-3"><Text className="text-center text-[14px] font-bold text-[#0F766E]">পরিবহন directory-তে ফিরে যান</Text></TouchableOpacity></ScrollView></ScreenContainer>;
}
