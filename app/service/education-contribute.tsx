import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { push, ref } from "firebase/database";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

const TYPES = [
  { id: "institution", label: "প্রতিষ্ঠান", icon: "school-outline" as const, color: "#15803D" },
  { id: "tutor", label: "গৃহশিক্ষক", icon: "person-outline" as const, color: "#2563EB" },
  { id: "notice", label: "নোটিশ / ভর্তি", icon: "megaphone-outline" as const, color: "#EA580C" },
  { id: "scholarship", label: "বৃত্তি", icon: "ribbon-outline" as const, color: "#7C3AED" },
];
function Field({ label, placeholder, value, onChangeText, multiline = false }: { label: string; placeholder: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) { return <View className="mb-4"><Text className="mb-2 text-[14px] font-extrabold text-foreground">{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A3B8" multiline={multiline} textAlignVertical={multiline ? "top" : "center"} className={`rounded-2xl border border-border bg-background px-4 py-3 text-[15px] text-foreground ${multiline ? "min-h-[105px]" : ""}`} /></View>; }

export default function EducationContributeScreen() {
  const [type, setType] = useState("institution");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [deadline, setDeadline] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const selected = TYPES.find((item) => item.id === type) || TYPES[0];
  function goBack() { if (router.canGoBack()) safeGoBack("/(tabs)"); else router.replace("/service/education" as any); }
  async function submit() {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth" as any); return; }
    if (!title.trim() || !details.trim()) { setMessage("শিরোনাম ও বিস্তারিত তথ্য পূরণ করুন।"); return; }
    setSaving(true); setMessage("");
    try { await push(ref(pathargataDb, "education_contribution_requests"), { type, typeLabel: selected.label, title: title.trim(), phone: phone.trim(), area: area.trim(), deadline: deadline.trim(), details: details.trim(), uid: user.uid, author: user.displayName || "Pathargata user", status: "pending", timestamp: Date.now() }); setSubmitted(true); setMessage("তথ্যটি গ্রহণ করা হয়েছে। Admin যাচাই করার পর Education tab-এ প্রকাশ করা হবে।"); } catch (error) { setMessage(error instanceof Error ? error.message : "তথ্য পাঠানো যায়নি। আবার চেষ্টা করুন।"); } finally { setSaving(false); }
  }
  return <ScreenContainer className="bg-background"><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"><View className="flex-row items-center"><TouchableOpacity onPress={goBack} className="h-10 w-10 items-center justify-center rounded-full bg-surface" accessibilityLabel="শিক্ষা screen-এ ফিরে যান"><Ionicons name="arrow-back" size={21} color="#334155" /></TouchableOpacity><View className="ml-3 flex-1"><Text className="text-xl font-extrabold text-foreground">শিক্ষার তথ্য যোগ করুন</Text><Text className="mt-1 text-xs text-muted">যাচাইয়ের জন্য তথ্য পাঠান</Text></View><Ionicons name="school-outline" size={25} color="#7C3AED" /></View><View className="mt-5 rounded-3xl bg-[#F5F3FF] p-5"><Text className="text-lg font-extrabold text-[#5B21B6]">স্থানীয় শিক্ষা তথ্য সমৃদ্ধ করুন</Text><Text className="mt-2 text-[13px] leading-5 text-[#6B5A91]">প্রতিষ্ঠান, শিক্ষক, ভর্তি notice বা বৃত্তির তথ্য পাঠাতে পারেন। প্রকাশের আগে Admin যাচাই করবে।</Text></View><Text className="mb-3 mt-6 text-[15px] font-extrabold text-foreground">কী ধরনের তথ্য?</Text><View className="flex-row flex-wrap gap-2">{TYPES.map((item) => <TouchableOpacity key={item.id} onPress={() => setType(item.id)} className={`w-[48%] flex-row items-center rounded-2xl border p-3 ${type === item.id ? "border-[#7C3AED] bg-[#F5F3FF]" : "border-border bg-surface"}`}><Ionicons name={item.icon} size={20} color={item.color} /><Text className="ml-2 text-[13px] font-extrabold text-foreground">{item.label}</Text></TouchableOpacity>)}</View><View className="mt-6 rounded-3xl border border-border bg-surface p-4"><Field label={type === "notice" || type === "scholarship" ? "শিরোনাম *" : "নাম *"} placeholder={type === "institution" ? "প্রতিষ্ঠানের নাম" : type === "tutor" ? "শিক্ষকের নাম" : "নোটিশ বা বৃত্তির নাম"} value={title} onChangeText={setTitle} /><Field label="এলাকা / প্রতিষ্ঠান" placeholder="যেমন: পাথরঘাটা সদর" value={area} onChangeText={setArea} /><Field label="যোগাযোগ নম্বর" placeholder="01XXXXXXXXX" value={phone} onChangeText={setPhone} /><Field label="শেষ তারিখ" placeholder="প্রযোজ্য হলে লিখুন" value={deadline} onChangeText={setDeadline} /><Field label="বিস্তারিত তথ্য *" placeholder="যোগ্যতা, subject, class, ভর্তি তথ্য বা সম্পূর্ণ বিবরণ লিখুন" value={details} onChangeText={setDetails} multiline /><TouchableOpacity onPress={() => void submit()} disabled={saving || submitted} className="items-center rounded-2xl py-4" style={{ backgroundColor: submitted ? "#94A3B8" : selected.color }}>{saving ? <ActivityIndicator color="white" /> : <Text className="text-[15px] font-extrabold text-white">{submitted ? "তথ্য পাঠানো হয়েছে" : "যাচাইয়ের জন্য পাঠান"}</Text>}</TouchableOpacity>{message ? <View className={`mt-3 rounded-2xl px-3 py-3 ${message.includes("গ্রহণ") ? "bg-green-50" : "bg-red-50"}`}><Text className={`text-center text-[13px] leading-4 ${message.includes("গ্রহণ") ? "text-green-800" : "text-red-800"}`}>{message}</Text></View> : null}</View><TouchableOpacity onPress={() => router.replace("/service/education" as any)} className="mt-4 py-3"><Text className="text-center text-[14px] font-bold text-[#7C3AED]">Education tab-এ ফিরে যান</Text></TouchableOpacity></ScrollView></ScreenContainer>;
}
