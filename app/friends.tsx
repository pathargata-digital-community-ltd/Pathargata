import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { onValue, ref } from "firebase/database";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { getFriendshipStatus, getPublicProfile } from "@/lib/social";

type FriendRow = { uid: string; name?: string; profile_pic?: string; profession?: string; union?: string; village?: string };

export default function FriendsScreen() {
  const user = pathargataAuth.currentUser;
  const params = useLocalSearchParams<{ uid?: string; name?: string }>();
  const targetUid = (Array.isArray(params.uid) ? params.uid[0] : params.uid) || user?.uid || "";
  const targetName = Array.isArray(params.name) ? params.name[0] : params.name;
  const isOwn = Boolean(user?.uid && targetUid === user.uid);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    const retryCycle = retryKey;
    let unsubscribe: () => void = () => {};
    if (!user || !targetUid || retryCycle < 0) { setAllowed(false); setFriends([]); setLoading(false); return () => { active = false; }; }
    setLoading(true);
    setError("");
    void (async () => {
      const relationship = isOwn ? "self" : await getFriendshipStatus(targetUid).catch(() => "none" as const);
      if (!active) return;
      const mayView = relationship === "self" || relationship === "friend";
      setAllowed(mayView);
      if (!mayView) { setFriends([]); setLoading(false); return; }
      unsubscribe = onValue(ref(pathargataDb, `users/${targetUid}/friends`), async (snapshot) => {
        const ids = Object.entries(snapshot.val() || {}).filter(([, enabled]) => Boolean(enabled)).map(([friendUid]) => friendUid);
        const profiles = await Promise.all(ids.map(async (friendUid) => [friendUid, await getPublicProfile(friendUid)] as const));
        const rows = profiles.map(([friendUid, value]) => {
          if (!value) return null;
          return { uid: friendUid, name: String(value.name || "Pathargata user"), profile_pic: typeof value.profile_pic === "string" ? value.profile_pic : undefined, profession: typeof value.profession === "string" ? value.profession : undefined, union: typeof value.union === "string" ? value.union : undefined, village: typeof value.village === "string" ? value.village : undefined };
        });
        if (active) { setFriends(rows.filter(Boolean) as FriendRow[]); setLoading(false); }
      }, () => { if (active) { setError("বন্ধু তালিকা লোড করা যায়নি।"); setLoading(false); } });
    })().catch(() => { if (active) { setError("বন্ধু তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।"); setLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, [user, targetUid, isOwn, retryKey]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return friends.filter((friend) => `${friend.name || ""} ${friend.profession || ""} ${friend.union || ""} ${friend.village || ""}`.toLowerCase().includes(term));
  }, [friends, search]);
  const heading = isOwn ? "বন্ধুবান্ধব" : `${targetName || "সদস্য"}-এর বন্ধুরা`;

  return (
    <ScreenContainer className="bg-background">
      <View className="flex-row items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <TouchableOpacity onPress={() => safeGoBack("/(tabs)")} className="h-10 w-10 items-center justify-center rounded-2xl bg-surface"><Ionicons name="arrow-back" size={20} color="#33443B" /></TouchableOpacity>
        <View className="flex-1"><Text className="text-[16px] font-extrabold text-foreground">{heading}</Text><Text className="text-[12px] text-muted">{friends.length} জন বন্ধু</Text></View>
        <Ionicons name="people-outline" size={20} color="#C18444" />
      </View>
      {allowed ? <View className="p-4"><TextInput value={search} onChangeText={setSearch} placeholder="নাম, পেশা বা এলাকা দিয়ে খুঁজুন" placeholderTextColor="#87928A" className="rounded-2xl border border-border bg-surface px-4 py-3 text-[14px] text-foreground" /></View> : null}
      {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color="#15803D" /></View> : !allowed ? <View className="flex-1 items-center justify-center px-6"><View className="h-16 w-16 items-center justify-center rounded-[22px] bg-surface"><Ionicons name="lock-closed-outline" size={27} color="#718078" /></View><Text className="mt-4 text-[15px] font-extrabold text-foreground">বন্ধু তালিকা ব্যক্তিগত</Text><Text className="mt-1 text-center text-[12px] leading-5 text-muted">শুধু নিজের এবং বন্ধুদের friend list দেখা যাবে।</Text></View> : error ? <View className="flex-1 items-center justify-center px-6"><Ionicons name="cloud-offline-outline" size={48} color="#B91C1C"/><Text className="mt-3 text-center text-[15px] font-extrabold text-foreground">বন্ধু তালিকা লোড করা যায়নি</Text><Text className="mt-2 text-center text-[12px] text-muted">{error}</Text><TouchableOpacity onPress={() => setRetryKey((value) => value + 1)} className="mt-4 rounded-xl bg-[#0B2D26] px-4 py-2.5"><Text className="text-[12px] font-bold text-white">আবার চেষ্টা করুন</Text></TouchableOpacity></View> : <FlatList data={filtered} keyExtractor={(item) => item.uid} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} removeClippedSubviews contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} ListEmptyComponent={<View className="items-center pt-16"><Ionicons name="people-outline" size={48} color="#94A3B8" /><Text className="mt-3 text-sm text-muted">{friends.length ? "কোনো বন্ধু খুঁজে পাওয়া যায়নি" : "এখনো কোনো বন্ধু নেই"}</Text></View>} renderItem={({ item }) => <TouchableOpacity onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: item.uid } })} className="mb-2 flex-row items-center rounded-2xl border border-border bg-surface p-3"><View className="h-12 w-12 items-center justify-center overflow-hidden rounded-[17px] bg-surface">{item.profile_pic ? <Image source={{ uri: item.profile_pic }} className="h-full w-full" /> : <Text className="text-lg font-bold text-[#0A6652]">{(item.name || "পা").slice(0, 1)}</Text>}</View><View className="ml-3 flex-1"><Text className="font-bold text-foreground">{item.name}</Text><Text className="mt-0.5 text-[12px] text-muted">{item.profession || "সদস্য"}{item.village || item.union ? ` · ${[item.village, item.union].filter(Boolean).join(" · ")}` : ""}</Text></View><Ionicons name="chevron-forward" size={18} color="#94A3B8" /></TouchableOpacity>} />}
    </ScreenContainer>
  );
}
