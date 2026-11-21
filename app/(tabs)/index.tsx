import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { get, onValue, ref, remove, set } from "firebase/database";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, BackHandler, Easing, FlatList, Platform, RefreshControl, Text, ToastAndroid, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { CommunityPostCard } from "@/components/community-post-card";
import { useCommunityFeed, type CommunityPost, type FeedFilter } from "@/hooks/use-community-feed";
import { useHomeDashboard } from "@/hooks/use-home-dashboard";
import { notificationSummary, useInAppNotificationBanner, useNotificationBadge } from "@/hooks/use-notifications";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { recordFeedInteraction } from "@/lib/feed-preferences";
import { subscribeToTabReselect } from "@/lib/tab-reselect";
import { clearPostUploadDraft } from "@/lib/post-upload-draft";

const shortcuts = [
  { id: "blood", icon: "water-outline" as const, label: "রক্ত সেবা", color: "#DC2626" },
  { id: "market", icon: "storefront-outline" as const, label: "মার্কেট", color: "#2563EB" },
  { id: "history_tourism", icon: "map-outline" as const, label: "পর্যটন", color: "#7C3AED" },
  { id: "transport", icon: "bus-outline" as const, label: "পরিবহন", color: "#EA580C" },
  { id: "ai-assistant", icon: "sparkles-outline" as const, label: "AI সহকারী", color: "#7C3AED" },
];
const filters: { id: FeedFilter; label: string }[] = [
  { id: "for-you", label: "আপনার জন্য" }, { id: "all", label: "সাম্প্রতিক" }, { id: "union", label: "ইউনিয়ন" }, { id: "village", label: "গ্রাম" },
];
type PostUploadState = { status: "uploading" | "complete" | "error"; progress: number; label: string; timestamp?: number };

function FeedSkeleton() {
  return <View className="mx-4 mb-4 overflow-hidden rounded-2xl border border-border bg-surface p-4"><View className="flex-row items-center"><View className="h-11 w-11 rounded-[17px] bg-[#DCE9E0]" /><View className="ml-3 flex-1"><View className="h-3 w-2/5 rounded-full bg-[#DCE9E0]" /><View className="mt-2 h-2.5 w-1/4 rounded-full bg-[#E7F0EA]" /></View></View><View className="mt-4 h-3 w-4/5 rounded-full bg-[#E7F0EA]" /><View className="mt-2 h-3 w-3/5 rounded-full bg-[#E7F0EA]" /><View className="mt-4 h-40 rounded-2xl bg-[#E7F0EA]" /></View>;
}
const FeedCardItem = memo(function FeedCardItem({ item, isSaved, onOpen, onRefresh, onHidden }: { item: CommunityPost; isSaved: boolean; onOpen: (post: CommunityPost) => void; onRefresh: () => void; onHidden: (postId: string) => void }) {
  const handleOpen = useCallback(() => onOpen(item), [item, onOpen]);
  const handleHidden = useCallback(() => onHidden(item.id), [item.id, onHidden]);
  return <CommunityPostCard post={item} isSaved={isSaved} allowAuthorLookup={false} showEngagementCounts={false} onOpen={handleOpen} onRefresh={onRefresh} onHidden={handleHidden} />;
}, (previous, next) => previous.item === next.item && previous.isSaved === next.isSaved && previous.onOpen === next.onOpen && previous.onRefresh === next.onRefresh && previous.onHidden === next.onHidden);

export default function HomeScreen() {
  const [filter, setFilter] = useState<FeedFilter>("for-you");
  const [postUpload, setPostUpload] = useState<PostUploadState | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(pathargataAuth.currentUser?.uid ?? null);
  const authUidRef = useRef(authUid);
  const { posts: data, savedPostIds, hidePost, refreshing, refresh, loading, loadingMore, hasMore, loadMore, source, newPostCount, clearNewPostAlert, resetPreferences } = useCommunityFeed(filter);
  const { notice, alerts } = useHomeDashboard();
  const { unreadCount } = useNotificationBadge();
  const { notification: inAppNotification, dismiss: dismissInAppNotification } = useInAppNotificationBanner();
  const greeting = authUid ? pathargataAuth.currentUser?.displayName || "শুভেচ্ছা" : "শুভেচ্ছা";
  const feedListRef = useRef<FlatList<CommunityPost> | null>(null);
  const alertWasVisible = useRef(false);
  const [postUploadAnimation] = useState(() => new Animated.Value(0));

  useEffect(() => onAuthStateChanged(pathargataAuth, (user) => {
    const nextUid = user?.uid ?? null;
    const switchedAccount = authUidRef.current !== nextUid;
    authUidRef.current = nextUid;
    setAuthUid(nextUid);
    if (switchedAccount || !user) setPostUpload(null);
  }), []);

  useEffect(() => {
    return subscribeToTabReselect((tab) => {
      if (tab !== "home") return;
      clearNewPostAlert();
      feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
      refresh();
    });
  }, [clearNewPostAlert, refresh]);

  useEffect(() => {
    const visible = newPostCount > 0;
    if (visible && !alertWasVisible.current && Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    alertWasVisible.current = visible;
  }, [newPostCount]);

  useEffect(() => {
    if (!postUpload) return;
    postUploadAnimation.stopAnimation();
    postUploadAnimation.setValue(0);
    Animated.timing(postUploadAnimation, {
      toValue: 1,
      duration: postUpload.status === "complete" ? 520 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [postUpload, postUploadAnimation]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android") return undefined;

    let lastBackPressAt = 0;
    const backPressSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const now = Date.now();
      if (now - lastBackPressAt < 2000) {
        return false;
      }

      lastBackPressAt = now;
      ToastAndroid.show("আবার Back চাপলে অ্যাপ বন্ধ হবে", ToastAndroid.SHORT);
      return true;
    });

    return () => backPressSubscription.remove();
  }, []));

  useFocusEffect(useCallback(() => {
    if (!authUid) { setPostUpload(null); return undefined; }
    let active = true;
    let stopLive: (() => void) | null = null;
    const progressRef = ref(pathargataDb, `users/${authUid}/post_upload`);
    const applyProgress = (snapshot: { val: () => unknown }) => {
      const value = snapshot.val() as Partial<PostUploadState> | null;
      if (!value || (value.status !== "uploading" && value.status !== "complete" && value.status !== "error")) {
        setPostUpload(null);
        return;
      }
      const timestamp = Number(value.timestamp) || 0;
      if (value.status === "uploading" && timestamp > 0 && Date.now() - timestamp > 10 * 60_000) {
        const failed = { status: "error" as const, progress: 0, label: "পোস্ট upload থেমে গেছে। সংরক্ষিত ড্রাফট থেকে আবার চেষ্টা করুন।", timestamp: Date.now() };
        setPostUpload(failed);
        void set(progressRef, failed).catch(() => undefined);
        stopLive?.();
        stopLive = null;
        return;
      }
      setPostUpload({ status: value.status, progress: Math.max(0, Math.min(100, Number(value.progress) || 0)), label: String(value.label || "পোস্ট upload হচ্ছে…"), timestamp });
      if (value.status !== "uploading" && stopLive) { stopLive(); stopLive = null; }
    };
    void get(progressRef).then((snapshot) => {
      if (!active) return;
      applyProgress(snapshot);
      const value = snapshot.val() as Partial<PostUploadState> | null;
      if (value?.status === "uploading") {
        stopLive = onValue(progressRef, (liveSnapshot) => { if (active) applyProgress(liveSnapshot); }, () => { if (active) setPostUpload(null); });
      }
    }).catch(() => { if (active) setPostUpload(null); });
    return () => { active = false; stopLive?.(); stopLive = null; };
  }, [authUid]));

  function retryFailedPost() {
    router.push({ pathname: "/compose", params: { retryDraft: "1", autoRetry: "1" } });
  }

  function cancelFailedPost() {
    const uid = pathargataAuth.currentUser?.uid;
    if (!uid) return;
    setPostUpload(null);
    void Promise.all([
      remove(ref(pathargataDb, `users/${uid}/post_upload`)).catch(() => undefined),
      clearPostUploadDraft(uid).catch(() => undefined),
    ]);
  }

  function showNewPosts() {
    clearNewPostAlert();
    refresh(true);
    requestAnimationFrame(() => feedListRef.current?.scrollToOffset({ offset: 0, animated: true }));
  }

  const openPost = useCallback((post: CommunityPost) => {
    void recordFeedInteraction(pathargataAuth.currentUser?.uid, post, "open");
    router.push({ pathname: "/post/[id]" as any, params: { id: post.id, title: post.title || "পোস্ট" } });
  }, []);
  const refreshFeed = useCallback(() => { void refresh(true); }, [refresh]);
  const renderFeedItem = useCallback(({ item }: { item: CommunityPost }) => <FeedCardItem item={item} isSaved={savedPostIds.includes(item.id)} onOpen={openPost} onRefresh={refreshFeed} onHidden={hidePost} />, [hidePost, openPost, refreshFeed, savedPostIds]);

  function confirmResetPreferences() {
    const uid = pathargataAuth.currentUser?.uid;
    if (!uid) return;
    Alert.alert("আপনার জন্য ফিড রিসেট", "এই ডিভাইসে রাখা পছন্দের বিষয় ও লেখক-সংক্রান্ত সংকেত মুছে নতুন করে শুরু করবেন?", [
      { text: "বাতিল", style: "cancel" },
      { text: "রিসেট", style: "destructive", onPress: () => { void resetPreferences(); } },
    ]);
  }

  function openShortcut(id: string, label: string) {
    if (id === "ai-assistant") {
      router.push("/ai-assistant" as never);
      return;
    }
    if (id === "history_tourism") {
      router.push("/service/tourism" as never);
      return;
    }
    router.push({ pathname: "/service/[category]" as any, params: { category: id, title: label } });
  }

  return <ScreenContainer className="bg-background"><View className="flex-1"><FlatList
    ref={feedListRef}
    data={data}
    keyExtractor={(item) => item.id}
    showsVerticalScrollIndicator={false}
    initialNumToRender={4}
    maxToRenderPerBatch={4}
    windowSize={5}
    updateCellsBatchingPeriod={50}
    removeClippedSubviews={Platform.OS !== "web"}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} tintColor="#15803D" colors={["#15803D"]} />}
    onEndReached={() => { if (hasMore) void loadMore(); }}
    onEndReachedThreshold={0.5}
    contentContainerStyle={{ paddingBottom: 28 }}
    ListHeaderComponent={<View className="px-5 pt-3 pb-4">
      <View className="flex-row items-center gap-2 mb-5"><View className="flex-[1.35] min-w-0"><Text className="text-[12px] text-muted" numberOfLines={1}>{greeting}</Text><Text className="text-[18px] font-extrabold text-foreground" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>পাথরঘাটা ডিজিটাল</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="অ্যাপের সবকিছু খুঁজুন" className="h-10 w-[88px] rounded-xl bg-surface border border-border px-2 flex-row items-center" onPress={() => router.push("/search")}><Ionicons name="search-outline" size={17} color="#64748B" /><Text className="ml-1 text-xs text-muted flex-1" numberOfLines={1}>খুঁজুন</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="নতুন পোস্ট লিখুন" className="h-10 w-10 rounded-xl bg-primary items-center justify-center" onPress={() => router.push("/compose")}><Ionicons name="create-outline" size={20} color="white" /></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="নোটিফিকেশন" className="h-10 w-10 rounded-xl bg-surface border border-border items-center justify-center" onPress={() => router.push("/notifications")}><Ionicons name="notifications-outline" size={21} color="#15803D" />{unreadCount > 0 ? <View className="absolute right-0 top-0 min-w-[18px] h-[18px] rounded-full bg-error items-center justify-center border-2 border-background"><Text className="text-[11px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</Text></View> : null}</TouchableOpacity></View>
      {inAppNotification ? <TouchableOpacity onPress={() => { dismissInAppNotification(); router.push("/notifications"); }} accessibilityRole="button" accessibilityLabel="নতুন নোটিফিকেশন দেখুন" className="mb-4 flex-row items-center overflow-hidden rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-3"><View className="h-10 w-10 items-center justify-center rounded-xl bg-[#DCFCE7]"><Ionicons name={inAppNotification.type === "market_order" ? "bag-handle-outline" : inAppNotification.type === "like" ? "heart" : inAppNotification.type === "comment" || inAppNotification.type === "reply" ? "chatbubble-ellipses" : inAppNotification.type === "repost" ? "repeat" : "notifications"} size={20} color="#15803D" /></View><View className="ml-3 flex-1"><Text className="text-[11px] font-extrabold uppercase tracking-[1px] text-[#15803D]">নতুন নোটিফিকেশন</Text><Text className="mt-0.5 text-[13px] font-bold leading-5 text-[#14532D]" numberOfLines={2}>{notificationSummary(inAppNotification)}</Text></View><Ionicons name="chevron-forward" size={18} color="#15803D" /></TouchableOpacity> : null}
      {notice ? <View className="mb-4 flex-row rounded-2xl border-l-4 border-orange-500 bg-orange-50 p-4"><Ionicons name="megaphone-outline" size={20} color="#EA580C" /><View className="ml-3 flex-1"><Text className="text-sm font-bold text-orange-900">{notice.title}</Text><Text className="mt-1 text-xs leading-5 text-orange-800" numberOfLines={2}>{notice.description}</Text></View></View> : null}
      {postUpload ? <Animated.View style={{ opacity: postUploadAnimation, transform: [{ translateY: postUploadAnimation.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }, { scale: postUploadAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }} className={`mb-4 rounded-2xl border px-4 py-3 ${postUpload.status === "error" ? "border-red-200 bg-red-50" : postUpload.status === "complete" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}><View className="flex-row items-center"><Ionicons name={postUpload.status === "error" ? "alert-circle-outline" : postUpload.status === "complete" ? "checkmark-circle-outline" : "cloud-upload-outline"} size={20} color={postUpload.status === "error" ? "#C24F55" : postUpload.status === "complete" ? "#15803D" : "#2563EB"} /><Text className={`ml-2 flex-1 text-xs font-bold ${postUpload.status === "error" ? "text-red-800" : postUpload.status === "complete" ? "text-green-800" : "text-blue-800"}`}>{postUpload.label}</Text><Text className="text-[12px] font-extrabold text-muted">{postUpload.progress}%</Text></View><View className="mt-2 h-2 overflow-hidden rounded-full bg-white/80"><View className={`h-full rounded-full ${postUpload.status === "error" ? "bg-red-500" : postUpload.status === "complete" ? "bg-green-600" : "bg-blue-600"}`} style={{ width: `${Math.max(postUpload.progress, postUpload.status === "uploading" ? 8 : 0)}%` }} /></View>{postUpload.status === "error" ? <View className="mt-3 flex-row justify-end gap-2"><TouchableOpacity accessibilityRole="button" onPress={retryFailedPost} className="rounded-xl bg-red-600 px-3 py-2"><Text className="text-xs font-extrabold text-white">আবার চেষ্টা</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={cancelFailedPost} className="rounded-xl border border-red-200 bg-white px-3 py-2"><Text className="text-xs font-extrabold text-red-700">বাতিল</Text></TouchableOpacity></View> : null}</Animated.View> : null}
      <View className="rounded-3xl bg-primary p-5 mb-5"><View className="flex-row items-start justify-between"><View className="flex-1 pr-3"><Text className="text-xs font-semibold text-green-100">আপনার কমিউনিটি হোম</Text><Text className="text-xl font-bold text-white mt-2">প্রয়োজনের সেবাটি দ্রুত খুঁজে নিন।</Text></View><Ionicons name="location-outline" size={30} color="#BBF7D0" /></View><TouchableOpacity className="self-start mt-4 rounded-full bg-white px-4 py-2.5" onPress={() => router.push("/services")}><Text className="text-sm font-bold text-primary">সেবা দেখুন</Text></TouchableOpacity></View>
      {alerts.length > 0 ? <TouchableOpacity className="rounded-2xl bg-red-50 border border-red-100 p-4 mb-5 flex-row items-center" onPress={() => router.push("/emergency" as any)}><View className="h-10 w-10 rounded-full bg-red-100 items-center justify-center"><Ionicons name="warning-outline" size={22} color="#DC2626" /></View><View className="ml-3 flex-1"><Text className="text-sm font-bold text-red-900">জরুরি এলার্ট</Text><Text className="text-xs text-red-700 mt-1" numberOfLines={1}>{alerts[0].title} · আরও {alerts.length > 1 ? `${alerts.length - 1}টি` : "দেখুন"}</Text></View><Ionicons name="chevron-forward" size={20} color="#DC2626" /></TouchableOpacity> : null}
      <View className="flex-row items-center justify-between mb-3"><Text className="text-lg font-bold text-foreground">দ্রুত সেবা</Text><TouchableOpacity onPress={() => router.push("/services")}><Text className="text-sm font-semibold text-primary">সব দেখুন</Text></TouchableOpacity></View>
      <View className="flex-row justify-between mb-6">{shortcuts.map((item) => <TouchableOpacity key={item.id} className="items-center" style={{ width: "18%" }} onPress={() => openShortcut(item.id, item.label)} accessibilityRole="button" accessibilityLabel={`${item.label} খুলুন`}><View className="h-14 w-14 rounded-2xl items-center justify-center mb-2" style={{ backgroundColor: `${item.color}18` }}><Ionicons name={item.icon} size={25} color={item.color} /></View><Text className="text-xs font-semibold text-foreground text-center" numberOfLines={2}>{item.label}</Text></TouchableOpacity>)}</View>
      <View className="flex-row items-center justify-between mb-3"><Text className="text-lg font-bold text-foreground">কমিউনিটি ফিড</Text><Text className="text-xs text-muted">{source === "cache" ? "cached" : source === "fallback" ? "offline" : "সরাসরি"}</Text></View>
      <View className="flex-row rounded-2xl bg-surface border border-border p-1 mb-3">{filters.map((item) => <TouchableOpacity key={item.id} onPress={() => setFilter(item.id)} className={`flex-1 rounded-xl py-2.5 items-center ${filter === item.id ? "bg-primary" : ""}`}><Text className={`text-[12px] font-bold ${filter === item.id ? "text-white" : "text-muted"}`}>{item.label}</Text></TouchableOpacity>)}</View>
      {filter === "for-you" ? <View className="flex-row items-start rounded-xl bg-green-50 border border-green-100 px-3 py-2.5 mb-4"><Ionicons name="sparkles-outline" size={18} color="#15803D" /><Text className="ml-2 flex-1 text-[12px] leading-4 text-green-900">পছন্দের পোস্ট, বন্ধু, এলাকা ও সাম্প্রতিকতার ভিত্তিতে সাজানো। পছন্দের সংকেত শুধু এই ডিভাইসে থাকে।</Text>{pathargataAuth.currentUser ? <TouchableOpacity onPress={confirmResetPreferences} accessibilityRole="button" accessibilityLabel="ফিড পছন্দ রিসেট করুন"><Text className="ml-2 text-[12px] font-bold text-primary">রিসেট</Text></TouchableOpacity> : null}</View> : null}
      {(filter === "union" || filter === "village") && !pathargataAuth.currentUser ? <Text className="text-xs text-muted text-center mb-3">ইউনিয়ন/গ্রাম feed দেখতে login করুন।</Text> : null}
    </View>}
    ListEmptyComponent={loading ? <View className="pt-2"><FeedSkeleton /><FeedSkeleton /></View> : <View className="items-center py-10"><Ionicons name="file-tray-outline" size={48} color="#CBD5E1" /><Text className="text-sm text-muted mt-3">এই filter-এ কোনো পোস্ট নেই।</Text></View>}
    ListFooterComponent={loadingMore ? <View className="py-5 items-center"><ActivityIndicator color="#15803D" /><Text className="text-xs text-muted mt-2">আরও পোস্ট লোড হচ্ছে...</Text></View> : hasMore && data.length > 0 ? <TouchableOpacity className="mx-5 my-2 rounded-2xl border border-border bg-surface py-3 items-center" onPress={() => void loadMore()}><Text className="text-sm font-bold text-primary">আরও পোস্ট দেখুন</Text></TouchableOpacity> : null}
    renderItem={renderFeedItem}
  /></View>{newPostCount > 0 ? <View pointerEvents="box-none" className="absolute top-20 left-0 right-0 items-center z-50"><TouchableOpacity className="flex-row items-center rounded-full bg-blue-600 px-5 py-3 shadow-lg" onPress={showNewPosts} accessibilityRole="button" accessibilityLabel={`${newPostCount}টি নতুন পোস্ট দেখুন`}><Ionicons name="arrow-up" size={18} color="white" /><Text className="ml-1 text-sm font-bold text-white">{newPostCount === 1 ? "নতুন পোস্ট এসেছে" : `${newPostCount}টি নতুন পোস্ট এসেছে`}</Text></TouchableOpacity></View> : null}</ScreenContainer>;
}
