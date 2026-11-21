import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { get, limitToLast, onValue, orderByChild, query, ref, set } from "firebase/database";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ChatListRow } from "@/components/chat-list-row";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

type ArchivedChat = { uid: string; name: string; lastMessage?: string; timestamp?: number; unread?: number; archived?: boolean; photo?: string; online?: boolean };

export default function MessageArchiveScreen() {
  const user = pathargataAuth.currentUser;
  const [items, setItems] = useState<ArchivedChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (!user) return;
    setLoading(true);
    const unsubscribe = onValue(
      query(ref(pathargataDb, `user_chats/${user.uid}`), orderByChild("timestamp"), limitToLast(100)),
      (snapshot) => {
        const raw = snapshot.val() || {};
        const archived = Object.entries(raw)
          .map(([uid, value]) => ({ uid, ...((value && typeof value === "object" ? value : {}) as Omit<ArchivedChat, "uid">) }))
          .filter((item) => item.archived === true)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setItems(archived);
        setError("");
        setLoading(false);
      },
      () => { setError("আর্কাইভ লোড করা যায়নি। আবার চেষ্টা করুন।"); setLoading(false); },
    );
    return unsubscribe;
  }, [user]));

  async function restore(uid: string) {
    if (!user) return;
    try {
      await set(ref(pathargataDb, `user_chats/${user.uid}/${uid}/archived`), false);
      setItems((current) => current.filter((item) => item.uid !== uid));
    } catch { setError("কথোপকথনটি ফিরিয়ে আনা যায়নি। আবার চেষ্টা করুন।"); }
  }

  if (!user) return <ScreenContainer className="bg-background"><View className="flex-1 items-center justify-center px-6"><Text className="text-lg font-extrabold text-foreground">আর্কাইভ দেখতে লগইন করুন</Text></View></ScreenContainer>;

  return <ScreenContainer className="bg-background">
    <View className="flex-row items-center border-b border-border px-5 pb-4 pt-3">
      <TouchableOpacity accessibilityLabel="মেসেজ সেটিংসে ফিরুন" onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
        <Ionicons name="arrow-back" size={21} color="#64748B" />
      </TouchableOpacity>
      <View className="ml-3 flex-1"><Text className="text-xl font-extrabold text-foreground">আর্কাইভ</Text><Text className="mt-0.5 text-xs text-muted">সংরক্ষিত কথোপকথনের তালিকা</Text></View>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-surface"><Ionicons name="archive-outline" size={20} color="#0A8065" /></View>
    </View>
    {error ? <Text accessibilityRole="alert" className="mx-5 mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</Text> : null}
    {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color="#0A8065" /><Text className="mt-3 text-sm text-muted">আর্কাইভ লোড হচ্ছে...</Text></View> : items.length ? <FlatList
      data={items}
      keyExtractor={(item) => item.uid}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 }}
      renderItem={({ item }) => <ChatListRow item={item} onOpen={() => router.push({ pathname: "/messages" as any, params: { uid: item.uid, name: item.name } })} onActions={() => void restore(item.uid)} />}
    /> : <View className="flex-1 items-center justify-center px-6"><View className="h-20 w-20 items-center justify-center rounded-[26px] bg-surface"><Ionicons name="archive-outline" size={38} color="#0A8065" /></View><Text className="mt-4 text-lg font-extrabold text-foreground">আর্কাইভ খালি</Text><Text className="mt-2 text-center text-sm leading-5 text-muted">আপনার archive করা কথোপকথন এখানে দেখা যাবে।</Text></View>}
  </ScreenContainer>;
}
