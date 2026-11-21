import { safeGoBack } from "@/lib/safe-navigation";
import { loadAdminDownloadLink } from "@/lib/app-download-link";
import { Ionicons } from "@expo/vector-icons";
import { get, ref } from "firebase/database";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Share, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

export default function InviteScreen() {
  const user = pathargataAuth.currentUser;
  const [referrals, setReferrals] = useState(0);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(Boolean(user));
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    void Promise.all([
      get(ref(pathargataDb, `users/${user.uid}/referral_count`)),
      loadAdminDownloadLink(),
    ]).then(([referralSnapshot, link]) => {
      if (!active) return;
      setReferrals(Number(referralSnapshot.val() || 0));
      setDownloadLink(link);
    }).catch(() => {
      if (active) setMessage("Referral তথ্য পুরোপুরি লোড করা যায়নি।");
    }).finally(() => {
      if (active) setLoadingLink(false);
    });
    return () => { active = false; };
  }, [user]);

  async function shareReferral() {
    if (!user || sharing) return;
    setSharing(true);
    setMessage("");
    try {
      const messageLines = [
        "পাথরঘাটা ডিজিটাল অ্যাপে যোগ দিন।",
        "আপনার এলাকার খবর, সেবা, মানুষ ও community এক জায়গায়।",
        `Referral code: ${user.uid}`,
        downloadLink ? `অ্যাপ ডাউনলোড: ${downloadLink}` : null,
      ];
      await Share.share({
        title: "পাথরঘাটা ডিজিটালে আমন্ত্রণ",
        message: messageLines.filter(Boolean).join("\n\n"),
        ...(downloadLink ? { url: downloadLink } : {}),
      });
      setMessage("Share sheet খোলা হয়েছে।");
    } catch {
      setMessage("Referral share করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSharing(false);
    }
  }

  function openDownloadLink() {
    if (!downloadLink) {
      Alert.alert("ডাউনলোড লিংক এখনও নেই", "Admin panel থেকে download link যোগ হলে এখানে দেখা যাবে।");
      return;
    }
    void Linking.openURL(downloadLink).catch(() => setMessage("ডাউনলোড লিংক খোলা যায়নি।"));
  }

  return (
    <ScreenContainer className="bg-background">
      <View className="flex-1 px-5 pt-4">
        <TouchableOpacity onPress={() => safeGoBack("/(tabs)")} accessibilityLabel="ফিরে যান" className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface">
          <Ionicons name="arrow-back" size={21} color="#334155" />
        </TouchableOpacity>

        <LinearGradient colors={["#0B5D4B", "#0A8065", "#15A878"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="mt-5 overflow-hidden rounded-[30px] p-6">
          <View className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
          <View className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/10" />
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/15"><Ionicons name="gift-outline" size={30} color="white" /></View>
          <Text className="mt-5 text-[27px] font-extrabold leading-9 text-white">বন্ধুদের আমন্ত্রণ জানান</Text>
          <Text className="mt-2 text-[14px] leading-6 text-[#D7F6EA]">আপনার এলাকার মানুষকে পাথরঘাটা ডিজিটাল community-তে যুক্ত করুন। আপনার referral code শেয়ার করলেই তারা সহজে অ্যাপে আসতে পারবে।</Text>
        </LinearGradient>

        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-[#D8EAE2] bg-[#F0FAF5] p-4"><Text className="text-[11px] font-bold uppercase tracking-wider text-[#4B7665]">আপনার referral</Text><Text className="mt-2 text-3xl font-extrabold text-[#0A6652]">{referrals}</Text><Text className="mt-1 text-xs text-[#668276]">জন আপনার code ব্যবহার করেছে</Text></View>
          <View className="flex-1 rounded-2xl border border-[#E8E1D3] bg-[#FFF9EE] p-4"><Text className="text-[11px] font-bold uppercase tracking-wider text-[#927146]">আপনার code</Text><Text className="mt-2 text-[15px] font-extrabold text-[#704F27]" numberOfLines={1}>{user?.uid?.slice(0, 12).toUpperCase() || "LOGIN REQUIRED"}</Text><Text className="mt-2 text-xs text-[#9D8868]">Share করলে code যুক্ত হবে</Text></View>
        </View>

        <View className="mt-4 rounded-3xl border border-border bg-surface p-5">
          <View className="flex-row items-center gap-3"><View className="h-11 w-11 items-center justify-center rounded-2xl bg-[#E8F5F1]"><Ionicons name="download-outline" size={22} color="#0A8065" /></View><View className="flex-1"><Text className="text-[16px] font-extrabold text-foreground">অ্যাপ ডাউনলোড লিংক</Text><Text className="mt-1 text-xs leading-5 text-muted">Admin panel-এর সর্বশেষ link share-এর সঙ্গে যুক্ত হবে।</Text></View></View>
          {loadingLink ? <View className="mt-4 flex-row items-center gap-2"><ActivityIndicator size="small" color="#0A8065" /><Text className="text-xs text-muted">লিংক খোঁজা হচ্ছে…</Text></View> : downloadLink ? <TouchableOpacity onPress={openDownloadLink} className="mt-4 flex-row items-center rounded-2xl bg-[#F0FAF5] px-3 py-3"><Ionicons name="link-outline" size={18} color="#0A8065" /><Text className="ml-2 flex-1 text-[12px] font-semibold text-[#0A6652]" numberOfLines={1}>{downloadLink}</Text><Ionicons name="open-outline" size={17} color="#0A8065" /></TouchableOpacity> : <View className="mt-4 rounded-2xl bg-[#FFF8EE] px-3 py-3"><Text className="text-xs leading-5 text-[#8C6A3C]">Admin panel-এ download link যোগ হলে এটি এখানে স্বয়ংক্রিয়ভাবে আসবে। এখন referral share করা যাবে, তবে download link ছাড়া।</Text></View>}
        </View>

        <TouchableOpacity onPress={() => void shareReferral()} disabled={!user || sharing} className="mt-5 flex-row items-center justify-center gap-2 rounded-2xl bg-[#0A8065] py-4 shadow-sm">
          {sharing ? <ActivityIndicator color="white" /> : <Ionicons name="share-social-outline" size={20} color="white" />}
          <Text className="text-[15px] font-extrabold text-white">{sharing ? "শেয়ার প্রস্তুত হচ্ছে…" : "Referral link শেয়ার করুন"}</Text>
        </TouchableOpacity>
        {message ? <Text className="mt-3 text-center text-[13px] font-semibold text-[#0A8065]">{message}</Text> : null}
        <Text className="mt-5 text-center text-xs leading-5 text-muted">Referral reward/points system আপাতত বন্ধ রাখা হয়েছে। তবে আপনার invite code দিয়ে নতুন সদস্যরা account তৈরি করতে পারবেন।</Text>
      </View>
    </ScreenContainer>
  );
}
