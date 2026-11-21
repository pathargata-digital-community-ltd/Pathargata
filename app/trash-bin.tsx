import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth } from "@/lib/pathargata-firebase";
import { loadTrashPosts, restoreTrashPost, type TrashPostRecord } from "@/lib/trash-bin";

type TrashItem = TrashPostRecord & { id: string };

function dateLabel(value?: number) {
  return value ? new Date(value).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" }) : "সময় অনুপস্থিত";
}

export default function TrashBinScreen() {
  const user = pathargataAuth.currentUser;
  const [items, setItems] = useState<TrashItem[]>([]);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setNow(Date.now());
    setError("");
    try {
      setItems(await loadTrashPosts(user.uid));
    } catch {
      setError("Trash Bin লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function restore(item: TrashItem) {
    if (!user || !item.data) return;
    Alert.alert("পোস্ট Restore করবেন?", "পোস্টটি আবার আপনার profile এবং privacy অনুযায়ী feed-এ ফিরে যাবে।", [
      { text: "বাতিল", style: "cancel" },
      {
        text: "Restore",
        onPress: () => void (async () => {
          setBusyId(item.id);
          try {
            await restoreTrashPost(item.id, item);
            setItems((current) => current.filter((entry) => entry.id !== item.id));
          } catch (restoreError) {
            setError(restoreError instanceof Error && restoreError.message === "TRASH_EXPIRED" ? "এই পোস্টের ৩০ দিনের সময় শেষ হয়ে গেছে।" : "পোস্ট Restore করা যায়নি।");
          } finally {
            setBusyId(null);
          }
        })(),
      },
    ]);
  }

  if (!user) return <ScreenContainer className="bg-background"><View className="flex-1 items-center justify-center p-5"><Text className="text-lg font-bold text-foreground">Trash Bin দেখতে login করুন</Text></View></ScreenContainer>;

  return (
    <ScreenContainer className="bg-background">
      <View className="flex-row items-center border-b border-border px-5 pb-3 pt-3">
        <TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full bg-surface" onPress={() => router.back()} accessibilityLabel="ফিরে যান"><Ionicons name="arrow-back" size={21} color="#334155" /></TouchableOpacity>
        <View className="ml-3 flex-1"><Text className="text-xl font-extrabold text-foreground">Trash Bin</Text><Text className="mt-1 text-xs text-muted">ডিলিট করা পোস্ট ৩০ দিন পর্যন্ত Restore করা যাবে</Text></View>
        <Ionicons name="trash-bin-outline" size={24} color="#B45309" />
      </View>
      <View className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><Text className="text-[13px] leading-5 text-amber-900">৩০ দিন পূর্ণ হলে পোস্টটি স্বয়ংক্রিয়ভাবে স্থায়ীভাবে মুছে যাবে। Admin moderation panel-এ এই deleted records আলাদাভাবে দেখা যাবে এবং admin যেকোনো সময় permanent delete করতে পারবেন।</Text></View>
      {error ? <Text className="mx-5 mt-4 text-sm text-red-700">{error}</Text> : null}
      {loading ? <View className="items-center py-16"><ActivityIndicator color="#B45309" /><Text className="mt-3 text-sm text-muted">Trash Bin লোড হচ্ছে...</Text></View> : items.length === 0 ? <View className="items-center px-8 py-16"><Ionicons name="checkmark-circle-outline" size={58} color="#CBD5E1" /><Text className="mt-4 text-base font-extrabold text-foreground">Trash Bin খালি</Text><Text className="mt-2 text-center text-sm leading-5 text-muted">আপনার ডিলিট করা পোস্ট এখানে দেখা যাবে।</Text></View> : <View className="px-4 pb-8 pt-4">{items.map((item) => { const expired = !item.expiresAt || item.expiresAt <= now; const data = item.data || {}; return <View key={item.id} className="mb-3 rounded-3xl border border-border bg-surface p-4"><View className="flex-row items-start"><View className="flex-1"><Text className="text-base font-extrabold text-foreground" numberOfLines={2}>{data.title || data.content || data.description || "শিরোনামহীন পোস্ট"}</Text><Text className="mt-2 text-xs text-muted">ডিলিট: {dateLabel(item.deletedAt || item.timestamp)}</Text><Text className={`mt-1 text-xs font-bold ${expired ? "text-red-700" : "text-amber-700"}`}>{expired ? "৩০ দিনের সময় শেষ" : `Restore-এর শেষ সময়: ${dateLabel(item.expiresAt)}`}</Text></View><Ionicons name="document-text-outline" size={25} color="#B45309" /></View>{expired ? <Text className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-4 text-red-700">এই পোস্ট আর Restore করা যাবে না। Server cleanup-এর মাধ্যমে এটি স্থায়ীভাবে মুছে যাবে।</Text> : <TouchableOpacity className="mt-4 items-center rounded-2xl bg-[#0A6652] py-3" onPress={() => restore(item)} disabled={busyId === item.id}>{busyId === item.id ? <ActivityIndicator color="white" /> : <Text className="font-extrabold text-white">পোস্ট Restore করুন</Text>}</TouchableOpacity>}</View>; })}</View>}
    </ScreenContainer>
  );
}
