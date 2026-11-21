import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { endBefore, equalTo, limitToLast, onValue, orderByChild, query, ref, startAt } from "firebase/database";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Share, Text, TouchableOpacity, View } from "react-native";
import { CommunityPostCard } from "@/components/community-post-card";
import { ProfessionVerificationBadge } from "@/components/profession-verification-badge";
import { ScreenContainer } from "@/components/screen-container";
import { normalizeCommunityPost, type CommunityPost } from "@/hooks/use-community-feed";
import { getWithCache, onValueWithCache } from "@/lib/rtdb-cache";
import { mergeFriendVisibleProfilePage, type CombinedProfileCursor, type ProfileIndexCursor, type ProfilePostCursor } from "@/lib/profile-post-pagination";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { acceptFriendRequest, blockUser, cancelFriendRequest, deleteFriendRequest, getBlockStatus, getFriendshipStatus, getPublicProfile, reportUser, sendFriendRequest, unblockUser, unfriend, type FriendshipStatus, type SocialProfile } from "@/lib/social";

type FriendPreview = { uid: string; name: string; profilePic?: string; profession?: string };
type ProfilePostSource = "index" | "public";
const PROFILE_POST_PAGE_SIZE = 12;
const labels: Record<FriendshipStatus, string> = {
  self: "এটি আপনার profile",
  friend: "বন্ধু",
  incoming: "রিকুয়েস্ট গ্রহণ করুন",
  outgoing: "রিকুয়েস্ট পাঠানো হয়েছে",
  none: "বন্ধু হিসেবে যোগ করুন",
};

export default function OtherProfileScreen() {
  const { uid: rawUid } = useLocalSearchParams<{ uid: string }>();
  const uid = Array.isArray(rawUid) ? rawUid[0] : rawUid;
  const currentUser = pathargataAuth.currentUser;
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [status, setStatus] = useState<FriendshipStatus>("none");
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [friends, setFriends] = useState<FriendPreview[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const postCursorRef = useRef<ProfilePostCursor | null>(null);
  const postSourceRef = useRef<ProfilePostSource>("public");
  const postsHasMoreRef = useRef(false);
  const postsLoadingMoreRef = useRef(false);
  const loadMoreProfilePostsRef = useRef<() => void>(() => undefined);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [postsError, setPostsError] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [hiddenPosts, setHiddenPosts] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!uid) { setLoading(false); return; }
    let active = true;
    postCursorRef.current = null;
    postsHasMoreRef.current = false;
    postsLoadingMoreRef.current = false;
    setPostCount(0);
    const applyProfile = async (value: unknown, readError?: Error) => {
      let resolved = value;
      if (!resolved) resolved = await getPublicProfile(uid);
      if (!active) return;
      setProfile(resolved ? { uid, ...(resolved as Omit<SocialProfile, "uid">) } : null);
      setProfileLoadError(readError ? "Profile data লোড করা যায়নি। আবার চেষ্টা করুন।" : "");
      setLoading(false);
    };
    const profileUnsubscribe = onValueWithCache(
      ref(pathargataDb, `people_index/${uid}`),
      (snapshot) => { void applyProfile(snapshot.val()); },
      (error) => { void applyProfile(null, error); },
    );
    const friendsUnsubscribe = onValue(ref(pathargataDb, `users/${uid}/friends`), async (snapshot) => {
      const friendMap = snapshot.val() || {};
      const ids = Object.entries(friendMap).filter(([, enabled]) => Boolean(enabled)).map(([friendUid]) => friendUid);
      if (!active) return;
      setFriendIds(ids);
      const profiles = await Promise.all(ids.slice(0, 6).map(async (friendUid) => {
        const value = await getPublicProfile(friendUid);
        if (!value) return null;
        return { uid: friendUid, name: String(value.name || "কমিউনিটি সদস্য"), profilePic: typeof value.profile_pic === "string" ? value.profile_pic : undefined, profession: typeof value.profession === "string" ? value.profession : undefined };
      }));
      if (active) setFriends(profiles.filter(Boolean) as FriendPreview[]);
    });
    let postsCancelled = false;
    const loadProfilePostsPage = async (cursor: ProfilePostCursor | null, requestedReplace: boolean, requestedSource: ProfilePostSource) => {
      let source = requestedSource;
      let replace = requestedReplace;
      const friendship = await getFriendshipStatus(uid).catch(() => "none" as FriendshipStatus);
      const indexPath = friendship === "self"
        ? `user_post_index/${uid}`
        : friendship === "friend"
          ? `friends_post_index/${uid}`
          : null;

      if ((friendship === "self" || friendship === "friend") && source !== "index") {
        source = "index";
        cursor = null;
        replace = true;
        postSourceRef.current = "index";
      } else if (source === "index" && !indexPath) {
        source = "public";
        cursor = null;
        replace = true;
        postSourceRef.current = "public";
      }
      if (friendship === "self" && cursor?.kind === "combined") {
        cursor = null;
        replace = true;
      } else if (friendship === "friend" && cursor?.kind === "timestamp") {
        cursor = null;
        replace = true;
      }

      if (friendship === "self" && indexPath) {
        const indexCursor = cursor?.kind === "timestamp" ? cursor : null;
        const indexRef = ref(pathargataDb, indexPath);
        const pageQuery = indexCursor
          ? query(indexRef, orderByChild("timestamp"), endBefore(indexCursor.timestamp, indexCursor.id), limitToLast(PROFILE_POST_PAGE_SIZE + 1))
          : query(indexRef, orderByChild("timestamp"), limitToLast(PROFILE_POST_PAGE_SIZE + 1));
        const { value, error } = await getWithCache<Record<string, Record<string, unknown>>>(pageQuery);
        if (error && !value) throw error;
        const entries = Object.entries(value || {})
          .map(([id, raw]) => ({ id, timestamp: Number(raw?.timestamp || 0) }))
          .filter((entry) => entry.timestamp > 0)
          .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
        const page = entries.slice(0, PROFILE_POST_PAGE_SIZE);
        if (replace && page.length === 0) {
          postSourceRef.current = "public";
          return loadProfilePostsPage(null, true, "public");
        }
        const loaded = await Promise.all(page.map(async ({ id }) => {
          const result = await getWithCache<Record<string, unknown>>(ref(pathargataDb, `posts/${id}`));
          return result.value ? normalizeCommunityPost(id, result.value) : null;
        }));
        const nextPosts = loaded.filter(Boolean) as CommunityPost[];
        const nextCursor: ProfileIndexCursor | null = page.length ? { kind: "timestamp", timestamp: page[page.length - 1].timestamp, id: page[page.length - 1].id } : null;
        const hasMore = entries.length > PROFILE_POST_PAGE_SIZE;
        if (!postsCancelled && active) {
          setPosts((current) => replace ? nextPosts : [...current, ...nextPosts.filter((post) => !current.some((item) => item.id === post.id))].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
          setPostCount((current) => replace ? nextPosts.length : current + nextPosts.length);
          postCursorRef.current = nextCursor;
          postsHasMoreRef.current = hasMore;
          setPostsHasMore(hasMore);
          setPostsError("");
        }
        return;
      }

      if (friendship === "friend" && indexPath) {
        const combinedCursor: CombinedProfileCursor = cursor?.kind === "combined"
          ? cursor
          : { kind: "combined", publicId: null, friendCursor: null };
        const publicQuery = combinedCursor.publicId
          ? query(ref(pathargataDb, "public_posts"), orderByChild("uid"), startAt(uid), endBefore(uid, combinedCursor.publicId), limitToLast(PROFILE_POST_PAGE_SIZE + 1))
          : query(ref(pathargataDb, "public_posts"), orderByChild("uid"), equalTo(uid), limitToLast(PROFILE_POST_PAGE_SIZE + 1));
        const friendIndexRef = ref(pathargataDb, indexPath);
        const friendQuery = combinedCursor.friendCursor
          ? query(friendIndexRef, orderByChild("timestamp"), endBefore(combinedCursor.friendCursor.timestamp, combinedCursor.friendCursor.id), limitToLast(PROFILE_POST_PAGE_SIZE + 1))
          : query(friendIndexRef, orderByChild("timestamp"), limitToLast(PROFILE_POST_PAGE_SIZE + 1));
        const [publicResult, friendResult] = await Promise.all([
          getWithCache<Record<string, Record<string, unknown>>>(publicQuery),
          getWithCache<Record<string, Record<string, unknown>>>(friendQuery),
        ]);
        if ((publicResult.error && !publicResult.value) || (friendResult.error && !friendResult.value)) {
          throw publicResult.error || friendResult.error || new Error("প্রোফাইল পোস্ট লোড হয়নি");
        }
        const publicEntries = Object.entries(publicResult.value || {})
          .map(([id, value]) => ({ id, value, timestamp: Number(value?.timestamp || 0) }))
          .filter((entry) => entry.timestamp > 0 && entry.value.uid === uid);
        const friendEntries = Object.entries(friendResult.value || {})
          .map(([id, raw]) => ({ id, timestamp: Number(raw?.timestamp || 0) }))
          .filter((entry) => entry.timestamp > 0);
        const merged = mergeFriendVisibleProfilePage(publicEntries, friendEntries, combinedCursor, PROFILE_POST_PAGE_SIZE);
        const loaded = await Promise.all(merged.page.map(async (entry) => {
          if (entry.fromPublic && entry.value) return normalizeCommunityPost(entry.id, entry.value);
          try {
            const result = await getWithCache<Record<string, unknown>>(ref(pathargataDb, `posts/${entry.id}`));
            return result.value ? normalizeCommunityPost(entry.id, result.value) : null;
          } catch {
            return null;
          }
        }));
        const nextPosts = loaded.filter(Boolean) as CommunityPost[];
        if (!postsCancelled && active) {
          setPosts((current) => replace ? nextPosts : [...current, ...nextPosts.filter((post) => !current.some((item) => item.id === post.id))].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
          setPostCount((current) => replace ? nextPosts.length : current + nextPosts.length);
          postCursorRef.current = merged.cursor;
          postsHasMoreRef.current = merged.hasMore;
          setPostsHasMore(merged.hasMore);
          setPostsError("");
        }
        return;
      }

      const publicCursor = cursor?.kind === "public" ? cursor : null;
      const publicQuery = publicCursor
        ? query(ref(pathargataDb, "public_posts"), orderByChild("uid"), startAt(uid), endBefore(uid, publicCursor.id), limitToLast(PROFILE_POST_PAGE_SIZE + 1))
        : query(ref(pathargataDb, "public_posts"), orderByChild("uid"), equalTo(uid), limitToLast(PROFILE_POST_PAGE_SIZE + 1));
      const { value, error } = await getWithCache<Record<string, Record<string, unknown>>>(publicQuery);
      if (error && !value) throw error;
      const entries = Object.entries(value || {})
        .map(([id, raw]) => ({ id, value: raw, timestamp: Number(raw?.timestamp || 0) }))
        .filter((entry) => entry.timestamp > 0 && entry.value.uid === uid)
        .sort((a, b) => b.id.localeCompare(a.id));
      const page = entries.slice(0, PROFILE_POST_PAGE_SIZE);
      const nextCursor = page.length ? { kind: "public" as const, id: page[page.length - 1].id } : null;
      const nextPosts = page.map((entry) => normalizeCommunityPost(entry.id, entry.value));
      if (!postsCancelled && active) {
        setPosts((current) => replace ? nextPosts : [...current, ...nextPosts.filter((post) => !current.some((item) => item.id === post.id))].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        setPostCount((current) => replace ? page.length : current + page.length);
        postCursorRef.current = nextCursor;
        postsHasMoreRef.current = entries.length > PROFILE_POST_PAGE_SIZE;
        setPostsHasMore(entries.length > PROFILE_POST_PAGE_SIZE);
        setPostsError("");
      }
    };
    void getFriendshipStatus(uid).then(async (friendship) => {
      const source: ProfilePostSource = friendship === "self" || friendship === "friend" ? "index" : "public";
      postSourceRef.current = source;
      await loadProfilePostsPage(null, true, source);
      if (active && !pathargataAuth.currentUser) setHiddenPosts([]);
    }).catch(() => {
      if (!postsCancelled && active) {
        setPosts([]);
        setPostsHasMore(false);
        setPostsError("পোস্টগুলো এখন লোড করা যাচ্ছে না। সার্ভার projection বা permission যাচাই করুন।");
      }
    });
    const loadMoreProfilePosts = () => {
      if (!postCursorRef.current || !postsHasMoreRef.current || postsLoadingMoreRef.current) return;
      postsLoadingMoreRef.current = true;
      setPostsLoadingMore(true);
      void loadProfilePostsPage(postCursorRef.current, false, postSourceRef.current).finally(() => {
        postsLoadingMoreRef.current = false;
        if (active) setPostsLoadingMore(false);
      });
    };
    loadMoreProfilePostsRef.current = loadMoreProfilePosts;
    const presenceUnsubscribe = onValueWithCache(ref(pathargataDb, `status/${uid}`), (snapshot) => setIsOnline(snapshot.val()?.state === "online"));
    void getFriendshipStatus(uid).then((next) => { if (active) setStatus(next); }).catch(() => { if (active) setStatus("none"); });
    void getBlockStatus(uid).then((next) => { if (active) setBlocked(next); }).catch(() => { if (active) setBlocked(false); });
    return () => {
      active = false;
      postsCancelled = true;
      loadMoreProfilePostsRef.current = () => undefined;
      profileUnsubscribe();
      friendsUnsubscribe();
      presenceUnsubscribe();
    };
  }, [uid]));

  const isSelf = status === "self" || Boolean(currentUser?.uid && currentUser.uid === uid);
  const canViewDetails = Boolean(profile && (!profile.profile_locked || status === "friend" || isSelf));
  const friendCount = friendIds.length;
  const shownPosts = useMemo(() => posts.filter((post) => {
    if (hiddenPosts.includes(post.id)) return false;
    const privacy = (post.privacy || "public").toLocaleLowerCase();
    if (["only_me", "only-me", "private"].includes(privacy)) return isSelf;
    if (["friends", "friends_only", "friends-only"].includes(privacy)) return isSelf || status === "friend";
    return privacy === "public" || privacy === "everyone";
  }), [posts, hiddenPosts, isSelf, status]);
  const canShowContacts = (status === "friend" || isSelf) && !profile?.hide_phone && !profile?.privacy_hide_contact;

  async function performFriendAction() {
    if (!profile || isSelf) return;
    if (!currentUser) { router.push("/auth"); return; }
    setBusy(true); setMessage("");
    try {
      if (status === "none") { await sendFriendRequest(profile); setStatus("outgoing"); setMessage("ফ্রেন্ড রিকুয়েস্ট পাঠানো হয়েছে।"); }
      else if (status === "outgoing") { await cancelFriendRequest(profile.uid); setStatus("none"); setMessage("রিকুয়েস্ট বাতিল করা হয়েছে।"); }
      else if (status === "incoming") { await acceptFriendRequest(profile.uid); setStatus("friend"); setMessage("রিকুয়েস্ট গ্রহণ হয়েছে—এখন আপনারা বন্ধু।"); }
      else Alert.alert("আনফ্রেন্ড করবেন?", `${profile.name || "এই সদস্য"}-কে বন্ধু তালিকা থেকে সরাতে চান?`, [
        { text: "বাতিল", style: "cancel" },
        { text: "আনফ্রেন্ড", style: "destructive", onPress: () => { void unfriend(profile.uid).then(() => { setStatus("none"); setMessage("বন্ধু তালিকা থেকে সরানো হয়েছে।"); }).catch(() => setMessage("এই কাজটি করা যায়নি।")); } },
      ]);
    } catch { setMessage("এই কাজটি এখন করা যাচ্ছে না। সার্ভার permission যাচাই করুন।"); }
    finally { setBusy(false); }
  }
  async function removeIncomingRequest() {
    if (!profile) return;
    setBusy(true);
    try { await deleteFriendRequest(profile.uid); setStatus("none"); setMessage("রিকুয়েস্ট মুছে ফেলা হয়েছে।"); }
    catch { setMessage("রিকুয়েস্ট মুছে ফেলা যায়নি।"); }
    finally { setBusy(false); }
  }
  async function shareProfile() {
    if (!profile) return;
    try { await Share.share({ title: profile.name || "Pathargata profile", message: `${profile.name || "Pathargata member"}\n${Linking.createURL(`/profile/${profile.uid}`)}` }); }
    catch { setMessage("Profile share করা যায়নি।"); }
  }
  function openMessage() {
    if (!profile || isSelf) return;
    if (blocked) { setMessage("আনব্লক করার পর এই ব্যবহারকারীকে message দিতে পারবেন।"); return; }
    router.push({ pathname: "/messages" as any, params: { uid: profile.uid, name: profile.name || "User" } });
  }
  function showProfileActions() {
    if (!profile || isSelf) return;
    Alert.alert("Profile options", `${profile.name || "এই সদস্য"}-এর জন্য একটি action বাছুন`, [
      { text: "মেসেজ দিন", onPress: openMessage },
      { text: blocked ? "আনব্লক করুন" : "ব্লক করুন", style: blocked ? "default" : "destructive", onPress: () => {
        void (blocked ? unblockUser(profile.uid) : blockUser(profile.uid)).then(() => {
          setBlocked(!blocked);
          setMessage(blocked ? "ব্যবহারকারীকে আনব্লক করা হয়েছে।" : "ব্যবহারকারীকে ব্লক করা হয়েছে।");
        }).catch(() => setMessage(blocked ? "আনব্লক করা যায়নি।" : "ব্লক করা যায়নি।"));
      } },
      { text: "রিপোর্ট করুন", style: "destructive", onPress: () => void reportUser(profile.uid).then(() => setMessage("রিপোর্ট জমা হয়েছে।")).catch(() => setMessage("রিপোর্ট জমা দেওয়া যায়নি।")) },
      { text: "বাতিল", style: "cancel" },
    ]);
  }
  async function openExternal(url: string) {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    try { if (await Linking.canOpenURL(normalized)) await Linking.openURL(normalized); }
    catch { setMessage("Link খোলা যায়নি।"); }
  }

  if (loading) return <ScreenContainer className="items-center justify-center bg-background"><ActivityIndicator color="#0A6652" /></ScreenContainer>;
  if (!profile) return <ScreenContainer className="bg-background px-5"><View className="flex-1 items-center justify-center"><View className="h-16 w-16 items-center justify-center rounded-[22px] bg-surface"><Ionicons name={profileLoadError ? "cloud-offline-outline" : "person-outline"} size={29} color="#0A6652" /></View><Text className="mt-4 text-lg font-extrabold text-foreground">{profileLoadError ? "Profile লোড করা যায়নি" : "Profile পাওয়া যায়নি"}</Text><Text className="mt-1 text-center text-xs text-muted">{profileLoadError || "এই account আর available নাও থাকতে পারে।"}</Text><TouchableOpacity onPress={() => safeGoBack("/(tabs)")} className="mt-5 rounded-xl bg-[#0B2D26] px-5 py-3"><Text className="text-[13px] font-bold text-white">ফিরে যান</Text></TouchableOpacity></View></ScreenContainer>;

  const hiddenContact = Boolean(profile.hide_phone || profile.privacy_hide_contact);
  return <ScreenContainer className="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} onScroll={(event) => { const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent; if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 240) loadMoreProfilePostsRef.current(); }} scrollEventThrottle={250} contentContainerStyle={{ paddingBottom: 38 }}>
      <View className="absolute left-4 right-4 top-3 z-10 flex-row items-center justify-between"><TouchableOpacity accessibilityLabel="ফিরে যান" onPress={() => safeGoBack("/(tabs)")} className="h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-[#0B2D26]/70"><Ionicons name="arrow-back" size={20} color="white" /></TouchableOpacity><View className="flex-row gap-2"><TouchableOpacity accessibilityLabel="Profile share করুন" onPress={() => void shareProfile()} className="h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-[#0B2D26]/70"><Ionicons name="share-social-outline" size={18} color="white" /></TouchableOpacity>{!isSelf ? <TouchableOpacity accessibilityLabel="Profile options" onPress={showProfileActions} className="h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-[#0B2D26]/70"><Ionicons name="ellipsis-horizontal" size={18} color="white" /></TouchableOpacity> : null}</View></View>
      <View className="relative h-[205px] overflow-hidden bg-[#0F5547]">{profile.cover_pic ? <TouchableOpacity activeOpacity={0.95} onPress={() => setImagePreview(profile.cover_pic || null)} className="h-full w-full"><Image source={{ uri: profile.cover_pic }} className="h-full w-full" resizeMode="cover" /></TouchableOpacity> : <View className="h-full w-full overflow-hidden bg-[#0F5547]"><View className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-[#C4E4D6]/15"/><View className="absolute -right-4 -top-16 h-56 w-56 rounded-full border border-[#C4E4D6]/20"/><View className="absolute right-8 -top-10 h-40 w-40 rounded-full border border-[#C4E4D6]/20"/><View className="absolute -bottom-20 -left-8 h-52 w-52 rounded-full bg-[#B7D977]/10"/><View className="absolute bottom-0 left-8 right-8 h-px bg-surface/10"/></View>}<TouchableOpacity onPress={() => profile.cover_pic && setImagePreview(profile.cover_pic)} activeOpacity={0.95} className="absolute inset-0" /></View>
      <View className="mx-4 -mt-5 rounded-[28px] border border-border bg-surface p-5 shadow-sm">
        <View className="flex-row items-center"><View className="relative h-[82px] w-[82px] items-center justify-center overflow-visible rounded-[26px] border-[3px] border-white bg-surface shadow-md"><TouchableOpacity onPress={() => profile.profile_pic && setImagePreview(profile.profile_pic)} className="h-full w-full items-center justify-center overflow-hidden rounded-[22px]">{profile.profile_pic ? <Image source={{ uri: profile.profile_pic }} className="h-full w-full" resizeMode="cover"/> : <Text className="text-3xl font-extrabold text-[#0A6652]">{(profile.name || "পা").slice(0, 1)}</Text>}</TouchableOpacity><View className={`absolute -bottom-1 -left-1 h-4 w-4 rounded-full border-[3px] border-white ${isOnline ? "bg-[#39A875]" : "bg-[#AAB5AE]"}`} /></View><View className="ml-4 min-w-0 flex-1"><View className="flex-row items-center gap-1.5"><Text numberOfLines={2} className="flex-1 text-[20px] font-extrabold leading-6 text-foreground">{profile.name || "Pathargata Member"}</Text>{profile.isVerified || profile.role === "journalist" ? <Ionicons name="checkmark-circle" size={18} color="#0A8065"/> : null}<TouchableOpacity onPress={() => void shareProfile()} className="h-8 w-8 items-center justify-center rounded-xl bg-surface"><Ionicons name="share-outline" size={18} color="#24624F"/></TouchableOpacity></View><Text className="mt-1 text-[13px] font-semibold text-muted">{profile.profession || "পাথরঘাটা কমিউনিটির সদস্য"}</Text><View className="mt-2 flex-row flex-wrap items-center gap-1.5"><View className="rounded-lg bg-[#EAF4EE] px-2 py-1"><Text className="text-[11px] font-bold text-[#23614D]">{profile.union || "ইউনিয়ন যোগ হয়নি"}</Text></View><Text className="text-[11px] text-muted">{profile.village || "গ্রাম যোগ হয়নি"}</Text>{profile.profile_locked ? <Ionicons name="lock-closed" size={14} color="#7A867D"/> : null}</View></View></View>
        {profile.bio ? <Text className="mt-4 border-l-[3px] border-[#C18444] pl-3 text-[15px] leading-[21px] text-muted">{profile.bio}</Text> : null}
        {profile.isVerified ? <View className="mt-3"><ProfessionVerificationBadge category={profile.verificationCategory} size="medium" /></View> : null}
        <View className="mt-5 flex-row gap-2"><TouchableOpacity onPress={() => void performFriendAction()} disabled={busy || isSelf || blocked} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${status === "friend" ? "border border-border bg-[#F5F8F5]" : "bg-[#0B2D26]"}`}>{busy ? <ActivityIndicator size="small" color={status === "friend" ? "#0B2D26" : "white"}/> : <><Ionicons name={status === "friend" ? "person-remove-outline" : status === "outgoing" ? "close-circle-outline" : status === "incoming" ? "person-add-outline" : "person-add"} size={18} color={status === "friend" ? "#0B2D26" : "white"}/><Text className={`text-[12px] font-bold ${status === "friend" ? "text-[#0B2D26]" : "text-white"}`}>{blocked ? "ব্লক করা" : labels[status]}</Text></>}</TouchableOpacity>{status === "incoming" ? <TouchableOpacity onPress={() => void removeIncomingRequest()} disabled={busy} className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface"><Ionicons name="trash-outline" size={18} color="#A24B43"/></TouchableOpacity> : null}{!isSelf && !blocked ? <TouchableOpacity onPress={openMessage} className="h-11 w-11 items-center justify-center rounded-xl bg-[#2F6980]"><Ionicons name="chatbubble-ellipses-outline" size={18} color="white"/></TouchableOpacity> : null}</View>
        {message ? <Text className="mt-3 text-center text-[12px] font-semibold text-[#24624F]">{message}</Text> : null}
      </View>

      <View className="mx-4 mt-4 flex-row gap-2"><View className="flex-1 rounded-2xl border border-border bg-surface p-3.5"><Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">পোস্ট</Text><Text className="mt-1 text-[20px] font-extrabold text-foreground">{postCount}{postsHasMore ? "+" : ""}</Text><View className="mt-2 h-1 w-9 rounded-full bg-[#0A8065]"/></View><View className="flex-1 rounded-2xl border border-border bg-surface p-3.5"><Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">বন্ধু</Text><Text className="mt-1 text-[20px] font-extrabold text-foreground">{friendCount}</Text><View className="mt-2 h-1 w-9 rounded-full bg-[#C18444]"/></View><View className="flex-1 rounded-2xl border border-border bg-surface p-3.5"><Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">সদস্য</Text><Text numberOfLines={1} className="mt-1 text-[14px] font-extrabold text-foreground">{profile.joinDate || "—"}</Text><View className="mt-2 h-1 w-9 rounded-full bg-[#718A9B]"/></View></View>

      {!canViewDetails ? <View className="mx-4 mt-4 items-center rounded-[26px] border border-border bg-surface px-6 py-8"><View className="h-14 w-14 items-center justify-center rounded-[20px] bg-surface"><Ionicons name="lock-closed-outline" size={25} color="#718078"/></View><Text className="mt-4 text-[15px] font-extrabold text-foreground">এই profile ব্যক্তিগত</Text><Text className="mt-1 max-w-[265px] text-center text-[12px] leading-5 text-muted">বন্ধু হলে পরিচিতির বিস্তারিত ও friends-only post দেখতে পারবেন।</Text></View> : <>
        <View className="mx-4 mt-4 rounded-[26px] border border-border bg-surface p-5"><View className="mb-4 flex-row items-center justify-between"><View><Text className="text-[15px] font-extrabold text-foreground">পরিচিতির বিবরণ</Text><Text className="mt-0.5 text-[12px] text-muted">এই সদস্যের profile information</Text></View><Ionicons name="finger-print-outline" size={20} color="#C18444"/></View>{profile.nickname ? <InfoRow icon="person-outline" label="ডাক নাম" value={profile.nickname}/> : null}<InfoRow icon="briefcase-outline" label="পেশা" value={profile.profession || "যোগ করা হয়নি"}/><InfoRow icon="location-outline" label="এলাকা" value={[profile.location, profile.village, profile.union].filter(Boolean).join(" · ") || "তথ্য যোগ করা হয়নি"}/>{profile.joinDate ? <InfoRow icon="calendar-outline" label="সদস্য হয়েছেন" value={profile.joinDate}/> : null}{canShowContacts && profile.phone ? <InfoRow icon="call-outline" label="মোবাইল" value={profile.phone}/> : null}{canShowContacts && (profile.email || currentUser?.uid === uid) ? <InfoRow icon="mail-outline" label="ইমেইল" value={profile.email || "ইমেইল যোগ করা হয়নি"}/> : null}{hiddenContact ? <View className="mt-1 flex-row items-center gap-2 rounded-xl bg-surface px-3 py-2.5"><Ionicons name="lock-closed-outline" size={18} color="#7D8980"/><Text className="text-[12px] text-muted">মোবাইল ও ইমেইল গোপন রাখা হয়েছে</Text></View> : null}{profile.facebook || profile.website || (canShowContacts && profile.whatsapp) ? <View className="mt-3 flex-row flex-wrap items-center gap-2 border-t border-border pt-4">{profile.facebook ? <SocialLink icon="logo-facebook" label="Facebook" onPress={() => void openExternal(profile.facebook || "")}/> : null}{profile.website ? <SocialLink icon="globe-outline" label="Website" onPress={() => void openExternal(profile.website || "")}/> : null}{canShowContacts && profile.whatsapp ? <SocialLink icon="logo-whatsapp" label="WhatsApp" onPress={() => void openExternal(`https://wa.me/${profile.whatsapp!.replace(/\D/g, "")}`)}/> : null}</View> : null}</View>

        <View className="mx-4 mt-4 rounded-[26px] border border-border bg-surface p-5"><View className="mb-4 flex-row items-center justify-between"><View><Text className="text-[15px] font-extrabold text-foreground">কমিউনিটি সংযোগ</Text><Text className="mt-0.5 text-[12px] text-muted">{friendCount} জন বন্ধু</Text></View><TouchableOpacity onPress={() => { if (status === "friend" || isSelf) router.push({ pathname: "/friends" as any, params: { uid: profile.uid, name: profile.name || "সদস্য" } }); else Alert.alert("বন্ধু তালিকা", "বন্ধুর নাম ও profile কেবল friends-দের জন্য দেখানো হয়।"); }} className="flex-row items-center gap-1"><Text className="text-[12px] font-bold text-[#0A6652]">সব বন্ধু</Text><Ionicons name="arrow-forward" size={18} color="#0A6652"/></TouchableOpacity></View>{friends.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 11 }}>{friends.map((friend) => <TouchableOpacity key={friend.uid} onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: friend.uid } })} className="w-[76px] items-center rounded-2xl bg-surface px-2 py-3"><View className="h-12 w-12 items-center justify-center overflow-hidden rounded-[17px] border border-border bg-surface">{friend.profilePic ? <Image source={{ uri: friend.profilePic }} className="h-full w-full"/> : <Text className="text-base font-bold text-[#0A6652]">{friend.name.slice(0, 1)}</Text>}</View><Text numberOfLines={1} className="mt-2 w-full text-center text-[11px] font-semibold text-foreground">{friend.name}</Text><Text numberOfLines={1} className="mt-0.5 w-full text-center text-[11px] text-muted">{friend.profession || "সদস্য"}</Text></TouchableOpacity>)}</ScrollView> : <View className="items-center rounded-2xl bg-surface px-4 py-5"><Ionicons name="people-outline" size={24} color="#8A978E"/><Text className="mt-2 text-[12px] text-muted">বন্ধু তালিকা এখনো খালি</Text></View>}</View>
      </>}

      <View className="mt-6"><View className="mb-3 flex-row items-end justify-between"><View><Text className="text-[11px] font-bold uppercase tracking-[2px] text-[#0A8065]">COMMUNITY JOURNAL</Text><Text className="mt-1 text-[20px] font-extrabold text-foreground">{profile.name || "সদস্য"}-এর পোস্ট</Text></View><Ionicons name="document-text-outline" size={19} color="#C18444"/></View>{!canViewDetails ? <View className="items-center rounded-[24px] border border-border bg-surface px-5 py-7"><Ionicons name="lock-closed-outline" size={25} color="#79857D"/><Text className="mt-2 text-[13px] font-semibold text-muted">বন্ধু হলে এই member-এর পোস্ট দেখতে পারবেন।</Text></View> : postsError ? <View className="items-center rounded-[24px] border border-red-200 bg-red-50 px-5 py-7"><Ionicons name="cloud-offline-outline" size={25} color="#B91C1C"/><Text className="mt-2 text-center text-[13px] font-semibold text-red-800">{postsError}</Text></View> : shownPosts.length ? shownPosts.map((post) => <CommunityPostCard key={post.id} post={post} showEngagementCounts={false} onOpen={() => router.push({ pathname: "/post/[id]" as any, params: { id: post.id, title: post.title || "পোস্ট" } })} onRefresh={() => undefined} onHidden={() => setHiddenPosts((ids) => [...ids, post.id])}/>) : <View className="items-center rounded-[24px] border border-dashed border-border bg-surface px-5 py-8"><View className="h-12 w-12 items-center justify-center rounded-[17px] bg-[#EAF4EE]"><Ionicons name="document-text-outline" size={21} color="#0A6652"/></View><Text className="mt-3 text-[14px] font-bold text-[#26372D]">এখনো কোনো public post নেই</Text><Text className="mt-1 text-center text-[12px] leading-5 text-muted">এই সদস্যের public post এখানে দেখা যাবে।</Text></View>}{postsLoadingMore ? <View className="items-center py-4"><ActivityIndicator color="#0A6652"/><Text className="mt-1 text-[12px] text-muted">আরও ১২টি পোস্ট লোড হচ্ছে...</Text></View> : null}{postsHasMore && !postsLoadingMore ? <TouchableOpacity onPress={() => loadMoreProfilePostsRef.current()} className="mx-4 mb-3 items-center rounded-xl border border-border bg-surface py-3"><Text className="text-[13px] font-bold text-[#0A6652]">আরও পোস্ট দেখুন</Text></TouchableOpacity> : null}{!postsLoadingMore && !postsHasMore && shownPosts.length > 0 ? <Text className="py-3 text-center text-[12px] text-muted">সব পোস্ট দেখানো হয়েছে</Text> : null}</View>
    </ScrollView>
    <Modal visible={Boolean(imagePreview)} transparent animationType="fade" onRequestClose={() => setImagePreview(null)}><View className="flex-1 items-center justify-center bg-black"><TouchableOpacity onPress={() => setImagePreview(null)} className="absolute right-5 top-12 z-10 h-11 w-11 items-center justify-center rounded-2xl bg-surface/15"><Ionicons name="close" size={23} color="white"/></TouchableOpacity>{imagePreview ? <Image source={{ uri: imagePreview }} className="h-full w-full" resizeMode="contain"/> : null}</View></Modal>
  </ScreenContainer>;
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View className="mb-3 flex-row items-start gap-3"><View className="h-8 w-8 items-center justify-center rounded-xl bg-surface"><Ionicons name={icon} size={18} color="#24624F"/></View><View className="flex-1 border-b border-border pb-3"><Text className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</Text><Text className="mt-0.5 text-[14px] font-semibold leading-[19px] text-foreground">{value}</Text></View></View>;
}
function SocialLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} className="flex-row items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2"><Ionicons name={icon} size={18} color="#24624F"/><Text className="text-[12px] font-bold text-foreground">{label}</Text></TouchableOpacity>;
}
