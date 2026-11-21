import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import { limitToLast, orderByChild, push, query, ref, set, equalTo } from "firebase/database";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { onValueWithCache as onValue } from "@/lib/rtdb-cache";

type FeedbackType = "feedback" | "missing";
type FeedbackStatus = "pending" | "in_progress" | "resolved" | "rejected";
type FeedbackRecord = { id: string; type: FeedbackType; title: string; details: string; status: FeedbackStatus; timestamp: number; adminReply?: string; updatedAt?: number };

const statusMeta: Record<FeedbackStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: "পর্যালোচনার অপেক্ষায়", color: "#B45309", icon: "time-outline" },
  in_progress: { label: "কাজ চলছে", color: "#2563EB", icon: "construct-outline" },
  resolved: { label: "সমাধান করা হয়েছে", color: "#15803D", icon: "checkmark-circle-outline" },
  rejected: { label: "গ্রহণ করা হয়নি", color: "#64748B", icon: "close-circle-outline" },
};

function formatDate(timestamp?: number) {
  return timestamp ? new Date(timestamp).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export default function FeedbackScreen() {
  const [type, setType] = useState<FeedbackType>("feedback");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(useCallback(() => {
    void reloadKey;
    const user = pathargataAuth.currentUser;
    if (!user) { setLoading(false); setRecords([]); return undefined; }
    setLoading(true); setError("");
    const feedbackQuery = query(ref(pathargataDb, "feedback_submissions"), orderByChild("uid"), equalTo(user.uid), limitToLast(30));
    return onValue(feedbackQuery, (snapshot) => {
      const value = snapshot.val() as Record<string, Record<string, unknown>> | null;
      const next = Object.entries(value || {}).map(([id, item]) => ({
        id,
        type: item.type === "missing" ? "missing" as const : "feedback" as const,
        title: String(item.title || ""),
        details: String(item.details || ""),
        status: (item.status === "in_progress" || item.status === "resolved" || item.status === "rejected" ? item.status : "pending") as FeedbackStatus,
        timestamp: Number(item.timestamp || 0),
        adminReply: item.adminReply ? String(item.adminReply) : undefined,
        updatedAt: item.updatedAt ? Number(item.updatedAt) : undefined,
      })).sort((a, b) => b.timestamp - a.timestamp);
      setRecords(next); setLoading(false); setRefreshing(false);
    }, () => { setError("আপনার পাঠানো মতামতগুলো লোড করা যায়নি।"); setLoading(false); setRefreshing(false); });
  }, [reloadKey]));

  async function submit() {
    const user = pathargataAuth.currentUser;
    const cleanTitle = title.trim();
    const cleanDetails = details.trim();
    if (!user) { Alert.alert("লগইন প্রয়োজন", "মতামত বা Missing Query পাঠাতে লগইন করুন।", [{ text: "লগইন", onPress: () => router.push("/auth") }]); return; }
    if (cleanTitle.length < 2 || cleanDetails.length < 5) { Alert.alert("তথ্য প্রয়োজন", "শিরোনাম কমপক্ষে ২ অক্ষর এবং বিস্তারিত কমপক্ষে ৫ অক্ষর লিখুন।"); return; }
    if (sending) return;
    setSending(true);
    try {
      const item = push(ref(pathargataDb, "feedback_submissions"));
      await set(item, { uid: user.uid, email: user.email || "", type, title: cleanTitle, details: cleanDetails, status: "pending", timestamp: Date.now() });
      setTitle(""); setDetails("");
      Alert.alert("ধন্যবাদ", "আপনার মতামত/অনুরোধ জমা হয়েছে। Admin review করলে status ও reply এখানে দেখা যাবে।");
    } catch { Alert.alert("দুঃখিত", "জমা দেওয়া যায়নি। ইন্টারনেট সংযোগ যাচাই করে আবার চেষ্টা করুন।"); }
    finally { setSending(false); }
  }

  const user = pathargataAuth.currentUser;
  return <ScreenContainer className="bg-background"><KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setReloadKey((value) => value + 1); }} />} contentContainerStyle={{ paddingBottom: 180, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
    <View className="flex-row items-center gap-3 px-5 pt-4"><TouchableOpacity onPress={() => safeGoBack("/settings")} className="h-10 w-10 items-center justify-center rounded-full bg-surface" accessibilityLabel="ফিরে যান"><Ionicons name="arrow-back" size={22} color="#166534" /></TouchableOpacity><View className="flex-1"><Text className="text-xl font-extrabold text-foreground">মতামত ও Missing Query</Text><Text className="mt-1 text-xs text-muted">আপনার পাঠানো অনুরোধের history এখানেই দেখুন</Text></View></View>
    {!user ? <View className="m-5 items-center rounded-3xl border border-border bg-surface px-6 py-10"><Ionicons name="lock-closed-outline" size={34} color="#0A6652" /><Text className="mt-3 text-center font-bold text-foreground">মতামত পাঠাতে এবং history দেখতে login করুন</Text><TouchableOpacity onPress={() => router.push("/auth")} className="mt-4 rounded-xl bg-primary px-5 py-3"><Text className="font-bold text-white">লগইন করুন</Text></TouchableOpacity></View> : <>
      <View className="m-5 rounded-3xl bg-[#0F5132] p-5"><Ionicons name="chatbox-ellipses-outline" size={30} color="white" /><Text className="mt-3 text-lg font-extrabold text-white">আপনার কথা admin-এর কাছে পৌঁছাবে</Text><Text className="mt-2 text-[13px] leading-5 text-green-100">অ্যাপের সমস্যা, পরামর্শ বা অনুপস্থিত তথ্য লিখুন। Admin যাচাই করে status এবং reply দিলে সেটি নিচের record-এ দেখা যাবে।</Text></View>
      <View className="mx-5 rounded-3xl border border-border bg-surface p-4"><View className="mb-3 flex-row gap-2"><TouchableOpacity onPress={() => setType("feedback")} className={`flex-1 rounded-xl border px-2 py-3 ${type === "feedback" ? "border-primary bg-green-50" : "border-border bg-background"}`}><Text className={`text-center text-[12px] font-bold ${type === "feedback" ? "text-primary" : "text-muted"}`}>মতামত / সমস্যা</Text></TouchableOpacity><TouchableOpacity onPress={() => setType("missing")} className={`flex-1 rounded-xl border px-2 py-3 ${type === "missing" ? "border-primary bg-green-50" : "border-border bg-background"}`}><Text className={`text-center text-[12px] font-bold ${type === "missing" ? "text-primary" : "text-muted"}`}>Missing Query</Text></TouchableOpacity></View><TextInput value={title} onChangeText={setTitle} maxLength={200} placeholder={type === "missing" ? "কোন তথ্য বা service অনুপস্থিত?" : "মতামতের সংক্ষিপ্ত শিরোনাম"} placeholderTextColor="#94A3B8" className="rounded-2xl border border-border bg-background px-4 py-3 text-foreground" /><TextInput value={details} onChangeText={setDetails} maxLength={5000} multiline textAlignVertical="top" placeholder={type === "missing" ? "কী যোগ করা দরকার, বিস্তারিত লিখুন" : "সমস্যা বা পরামর্শটি বিস্তারিত লিখুন"} placeholderTextColor="#94A3B8" className="mt-3 h-32 rounded-2xl border border-border bg-background px-4 py-3 text-foreground" /><Text className="mt-1 text-right text-[11px] text-muted">{details.length}/5000</Text><TouchableOpacity disabled={sending} onPress={() => void submit()} className={`mt-2 items-center rounded-2xl py-4 ${sending ? "bg-emerald-400" : "bg-primary"}`}>{sending ? <ActivityIndicator color="white" /> : <Text className="font-extrabold text-white">Admin-এর কাছে জমা দিন</Text>}</TouchableOpacity></View>
      <View className="mx-5 mt-7"><View className="mb-3 flex-row items-center justify-between"><Text className="text-lg font-extrabold text-foreground">আমার পাঠানো record</Text><Text className="text-xs font-bold text-muted">{records.length}টি</Text></View>{loading ? <View className="items-center rounded-2xl bg-surface py-8"><ActivityIndicator color="#0A6652" /><Text className="mt-2 text-xs text-muted">আপনার record লোড হচ্ছে...</Text></View> : error ? <TouchableOpacity onPress={() => { setRefreshing(true); setReloadKey((value) => value + 1); }} className="rounded-2xl bg-red-50 p-4"><Text className="text-center text-sm font-bold text-red-700">{error}</Text><Text className="mt-2 text-center text-xs font-bold text-red-600">আবার চেষ্টা করুন</Text></TouchableOpacity> : records.length ? records.map((item) => { const meta = statusMeta[item.status]; return <View key={item.id} className="mb-3 rounded-2xl border border-border bg-surface p-4"><View className="flex-row items-start"><View className="flex-1"><Text className="text-[11px] font-bold text-primary">{item.type === "missing" ? "MISSING QUERY" : "FEEDBACK"}</Text><Text className="mt-1 text-[15px] font-extrabold text-foreground">{item.title}</Text></View><View className="ml-2 flex-row items-center rounded-full px-2 py-1" style={{ backgroundColor: `${meta.color}16` }}><Ionicons name={meta.icon} size={14} color={meta.color} /><Text className="ml-1 text-[10px] font-bold" style={{ color: meta.color }}>{meta.label}</Text></View></View><Text className="mt-2 text-[13px] leading-5 text-muted">{item.details}</Text><View className="mt-3 flex-row items-center border-t border-border pt-3"><Text className="flex-1 text-[11px] text-muted">জমা: {formatDate(item.timestamp)}{item.updatedAt ? ` · আপডেট: ${formatDate(item.updatedAt)}` : ""}</Text></View>{item.adminReply ? <View className="mt-3 rounded-2xl bg-blue-50 px-3 py-2.5"><Text className="text-[11px] font-extrabold text-blue-800">Admin-এর উত্তর</Text><Text className="mt-1 text-[12px] leading-5 text-blue-900">{item.adminReply}</Text></View> : null}</View>; }) : <View className="items-center rounded-2xl border border-dashed border-border bg-surface px-5 py-8"><Ionicons name="documents-outline" size={32} color="#94A3B8" /><Text className="mt-2 text-center text-sm font-bold text-foreground">এখনো কোনো মতামত বা Missing Query পাঠাননি</Text></View>}</View>
    </>}
  </ScrollView></KeyboardAvoidingView></ScreenContainer>;
}
