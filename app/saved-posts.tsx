import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { get, onValue, ref } from "firebase/database";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
type Post = Record<string, unknown> & { id: string };
function display(value: unknown): string { return typeof value === "string" ? value : ""; }
export default function SavedPostsScreen() {
  const uid = pathargataAuth.currentUser?.uid;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useFocusEffect(useCallback(() => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    let ids: string[] = [];
    let active = true;
    const stopSaved = onValue(ref(pathargataDb, `users/${uid}/saved_posts`), (snapshot) => {
      ids = Object.keys(snapshot.val() || {}).slice(-50).reverse();
      void Promise.all(ids.map(async (id) => [id, (await get(ref(pathargataDb, `posts/${id}`))).val()] as const)).then((entries) => {
        if (!active) return;
        setPosts(entries.map(([id, value]) => ({ ...(value || {}), id })).filter((post) => Object.keys(post).length > 1));
        setLoading(false); setError("");
      }).catch(() => { if (active) { setError("পোস্ট ডেটা লোড করা যায়নি।"); setLoading(false); } });
    }, () => { setError("সংরক্ষিত পোস্ট লোড করা যায়নি।"); setLoading(false); });
    return () => { active = false; stopSaved(); };
  }, [uid]),);
  return <ScreenContainer className="bg-background"><View className="flex-row items-center gap-3 px-4 pt-4 pb-3"><TouchableOpacity onPress={() => safeGoBack("/(tabs)")}><Ionicons name="arrow-back" size={23} color="#166534" /></TouchableOpacity><Text className="text-xl font-bold text-foreground">সংরক্ষিত পোস্ট</Text></View>{loading ? <ActivityIndicator className="mt-10" color="#15803D" /> : error ? <Text className="px-5 mt-8 text-center text-red-600">{error}</Text> : <FlatList data={posts} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }} ListEmptyComponent={<View className="flex-1 items-center justify-center mt-20"><Ionicons name="bookmark-outline" size={42} color="#94A3B8"/><Text className="mt-3 text-muted">এখনও কোনো পোস্ট সংরক্ষণ করেননি।</Text></View>} renderItem={({ item }) => <TouchableOpacity onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })} className="rounded-2xl border border-border bg-surface p-4 mb-3"><Text className="font-bold text-foreground">{display(item.authorName || item.name) || "কমিউনিটি সদস্য"}</Text><Text className="text-foreground mt-2" numberOfLines={4}>{display(item.text || item.content || item.caption) || "ছবি-সহ পোস্ট"}</Text><Text className="text-xs text-muted mt-3">পোস্ট খুলতে চাপ দিন</Text></TouchableOpacity>} />}</ScreenContainer>;
}
