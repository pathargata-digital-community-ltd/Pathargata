import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { get, onValue, ref, remove, set } from "firebase/database";
import { memo, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { PostImageGallery, PostYoutubeCard } from "@/components/post-rich-media";
import { RepostComposer } from "@/components/repost-composer";
import type { CommunityPost, FeedCommentPreview } from "@/hooks/use-community-feed";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { playAppSound } from "@/lib/app-sounds";
import { recordFeedInteraction } from "@/lib/feed-preferences";
import { addPostComment, reportPost, repostPost, setSavedPost, toggleMutedPost, togglePostLike } from "@/lib/post-interactions";
import { invalidateRtdbSnapshotCache } from "@/lib/rtdb-cache";
import { buildTrashRecord, trashPostPath } from "@/lib/trash-bin";
import { getPostBackgroundColors } from "@/lib/post-background";

type Props = {
  post: CommunityPost;
  onOpen: () => void;
  onRefresh: () => void;
  onHidden: () => void;
  isSaved?: boolean;
  allowAuthorLookup?: boolean;
  showEngagementCounts?: boolean;
};

function MenuRow({ icon, title, subtitle, danger = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; danger?: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-[#F4F7F4]"><View className={`h-10 w-10 items-center justify-center rounded-xl ${danger ? "bg-[#FFF0EF]" : "bg-surface"}`}><Ionicons name={icon} size={19} color={danger ? "#B24D45" : "#24624F"} /></View><View className="flex-1"><Text className={`text-[15px] font-bold ${danger ? "text-[#A3413A]" : "text-foreground"}`}>{title}</Text>{subtitle ? <Text className="mt-0.5 text-[12px] text-muted">{subtitle}</Text> : null}</View><Ionicons name="chevron-forward" size={18} color="#A1AAA3" /></TouchableOpacity>;
}
function PostTextBlock({ post }: { post: CommunityPost }) {
  const [expanded, setExpanded] = useState(false);
  const colors = getPostBackgroundColors(post.bgColor);
  const canExpand = post.body.length > 280;
  const content = <View className="px-4 pb-3 pt-1"><Text className={`text-[15px] leading-[21px] ${colors ? "font-semibold text-white" : "text-foreground"}`} numberOfLines={expanded ? undefined : 5}>{post.body}</Text>{canExpand ? <TouchableOpacity onPress={() => setExpanded((value) => !value)} className="mt-2 self-start"><Text className={`text-[13px] font-extrabold ${colors ? "text-white" : "text-primary"}`}>{expanded ? "কম দেখান" : "আরও দেখুন"}</Text></TouchableOpacity> : null}</View>;
  return colors ? <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="mx-4 mb-3 overflow-hidden rounded-2xl"><View className="px-1 pt-1">{content}</View></LinearGradient> : content;
}
function FeedMediaPlaceholder({ kind, onPress }: { kind: "audio" | "video"; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} className="mx-4 mb-3 flex-row items-center rounded-2xl bg-slate-900 px-4 py-3" accessibilityRole="button" accessibilityLabel={kind === "audio" ? "অডিও পোস্ট খুলুন" : "ভিডিও পোস্ট খুলুন"}>
    <Ionicons name={kind === "audio" ? "volume-high-outline" : "play-circle-outline"} size={24} color="white" />
    <View className="ml-3 flex-1"><Text className="text-sm font-bold text-white">{kind === "audio" ? "ভয়েস পোস্ট" : "ভিডিও পোস্ট"}</Text><Text className="mt-0.5 text-xs text-slate-300">বিস্তারিত খুলে চালু করুন</Text></View>
    <Ionicons name="arrow-forward" size={18} color="#BBF7D0" />
  </TouchableOpacity>;
}
function CommunityPostCardComponent({ post, onOpen, onRefresh, onHidden, isSaved, allowAuthorLookup = true, showEngagementCounts = true }: Props) {
  const user = pathargataAuth.currentUser;
  const ownPost = Boolean(user?.uid && user.uid === post.uid);
  const [menuOpen, setMenuOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeStateLoaded, setLikeStateLoaded] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null);
  const [likeCountOverride, setLikeCountOverride] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [fetchedAuthorPic, setFetchedAuthorPic] = useState<string | undefined>();
  const liked = likedOverride ?? post.isLiked;
  const likeCount = likeCountOverride ?? post.likeCount;
  const savedNow = savedOverride ?? (typeof isSaved === "boolean" ? isSaved : savedLoaded ? saved : false);
  const authorPic = post.authorPic || fetchedAuthorPic;
  const mediaImages = post.images.filter(Boolean);
  const originalImages = post.originalPostImages || [];
  const originalAuthor = post.originalPostAuthor || "মূল লেখক";
  const userVote = user?.uid ? post.voters?.[user.uid] : undefined;
  const pollTotal = post.options?.reduce((sum, option) => sum + (Number(option.votes) || 0), 0) || 0;

  useEffect(() => {
    let active = true;
    if (allowAuthorLookup && post.uid && !post.authorPic) {
      void get(ref(pathargataDb, `people_index/${post.uid}`)).then((snapshot) => {
        const photo = snapshot.val()?.profile_pic;
        if (active && typeof photo === "string") setFetchedAuthorPic(photo);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [allowAuthorLookup, post.uid, post.authorPic]);

  useEffect(() => {
    const resetTimer = setTimeout(() => {
      setLikeStateLoaded(false);
      setLikedOverride(null);
    }, 0);
    if (!user?.uid) {
      const loadedTimer = setTimeout(() => setLikeStateLoaded(true), 0);
      return () => { clearTimeout(resetTimer); clearTimeout(loadedTimer); };
    }
    const unsubscribe = onValue(
      ref(pathargataDb, `posts/${post.id}/likes/${user.uid}`),
      (snapshot) => { setLikedOverride(snapshot.val() === true); setLikeStateLoaded(true); },
      () => setLikeStateLoaded(true),
    );
    return () => { clearTimeout(resetTimer); unsubscribe(); };
  }, [post.id, user?.uid]);

  useEffect(() => {
    let active = true;
    if (typeof isSaved === "boolean") {
      return () => { active = false; };
    }
    if (!user?.uid) return;
    void Promise.all([
      get(ref(pathargataDb, `users/${user.uid}/saved_posts/${post.id}`)),
      get(ref(pathargataDb, `users/${user.uid}/saved/${post.id}`)),
    ]).then(([nativeSaved, webSaved]) => {
      if (active) { setSaved(nativeSaved.exists() || webSaved.exists()); setSavedLoaded(true); }
    }).catch(() => { if (active) setSavedLoaded(true); });
    return () => { active = false; };
  }, [isSaved, post.id, user?.uid]);

  async function toggleLike() {
    if (!user) { router.push("/auth"); return; }
    if (!likeStateLoaded || likeBusy) return;
    const wasLiked = liked;
    const oldCount = likeCount;
    setLikeBusy(true);
    setLikedOverride(!wasLiked);
    setLikeCountOverride(Math.max(0, oldCount + (wasLiked ? -1 : 1)));
    try {
      const actual = await togglePostLike(post.id);
      setLikedOverride(actual);
      if (actual) playAppSound("like");
    } catch {
      setLikedOverride(wasLiked);
      setLikeCountOverride(oldCount);
      playAppSound("error");
      Alert.alert("লাইক দেওয়া যায়নি", "আবার চেষ্টা করুন।");
    } finally {
      setLikeBusy(false);
    }
  }
  async function submitComment() {
    if (!commentDraft.trim()) return;
    if (!user) { router.push("/auth"); return; }
    setCommenting(true);
    try {
      await addPostComment(post.id, commentDraft.trim());
      playAppSound("comment");
      setCommentDraft("");
      Alert.alert("মন্তব্য যোগ হয়েছে");
    } catch { playAppSound("error"); Alert.alert("মন্তব্য যোগ করা যায়নি", "আবার চেষ্টা করুন।"); }
    finally { setCommenting(false); }
  }
  function showMenu() { setMenuOpen(true); }
  function closeMenu() { setMenuOpen(false); }
  function openRepost() {
    closeMenu();
    if (!user) { router.push("/auth"); return; }
    if (post.privacy && post.privacy !== "public" && post.privacy !== "everyone") { Alert.alert("এই পোস্টটি রিপোস্ট করা যাবে না", "মূল লেখক পোস্টটি Friends-only বা private রেখেছেন।"); return; }
    setRepostOpen(true);
  }
  async function confirmRepost(message: string) {
    try {
      await repostPost(post.id, message);
      setRepostOpen(false);
      onRefresh();
      Alert.alert("রিপোস্ট সম্পন্ন", "মূল লেখকের নামসহ পোস্টটি আপনার নামে Community Feed-এ যোগ হয়েছে।");
    } catch (error) {
      playAppSound("error");
      Alert.alert("রিপোস্ট করা যায়নি", error instanceof Error && error.message === "POST_NOT_PUBLIC" ? "মূল লেখক পোস্টটি public রাখেননি।" : "আবার চেষ্টা করুন।");
      throw new Error("REPOST_FAILED");
    }
  }
  function openOriginalPost() {
    if (post.originalPostId) router.push({ pathname: "/post/[id]" as any, params: { id: post.originalPostId } });
  }
  function openAuthor() {
    if (!post.uid) return;
    if (post.uid === user?.uid) router.push("/(tabs)/profile" as any);
    else router.push({ pathname: "/profile/[uid]" as any, params: { uid: post.uid } });
  }
  async function runMenuAction(action: "save" | "mute" | "report" | "hide" | "copy" | "copyLink" | "edit" | "delete") {
    closeMenu();
    if (!user && action !== "copy" && action !== "copyLink") { router.push("/auth"); return; }
    setBusyAction(action);
    try {
      if (action === "save") {
        const next = await setSavedPost(post.id, !savedNow, post);
        setSaved(next); setSavedOverride(next); setSavedLoaded(true);
        Alert.alert(next ? "সংরক্ষণ করা হয়েছে" : "সংরক্ষণ থেকে সরানো হয়েছে");
      } else if (action === "mute") {
        const next = await toggleMutedPost(post.id);
        Alert.alert(next ? "এই পোস্টের নোটিফিকেশন বন্ধ" : "নোটিফিকেশন আবার চালু");
      } else if (action === "report") {
        await reportPost(post.id, "ব্যবহারকারীর রিপোর্ট", post); Alert.alert("রিপোর্ট পাঠানো হয়েছে", "আমাদের moderation team বিষয়টি পর্যালোচনা করবে।");
      } else if (action === "hide") {
        if (user?.uid) {
          await set(ref(pathargataDb, `users/${user.uid}/hidden_posts/${post.id}`), true);
          await invalidateRtdbSnapshotCache([`users/${user.uid}`]);
          await recordFeedInteraction(user.uid, post, "hide");
        }
        onHidden();
      } else if (action === "copy") {
        await Clipboard.setStringAsync(`${post.title}\n${post.body}`.trim()); Alert.alert("পোস্টের লেখা কপি হয়েছে");
      } else if (action === "copyLink") {
        await Clipboard.setStringAsync(Linking.createURL(`/post/${post.id}`)); Alert.alert("পোস্টের লিংক কপি হয়েছে");
      } else if (action === "edit") {
        onOpen();
      } else if (action === "delete" && user?.uid) {
        Alert.alert("পোস্ট মুছবেন?", "পোস্টটি trash bin-এ রেখে feed থেকে সরানো হবে.", [
          { text: "বাতিল", style: "cancel" },
          { text: "পোস্ট মুছুন", style: "destructive", onPress: () => {
            void (async () => {
              try {
                const snapshot = await get(ref(pathargataDb, `posts/${post.id}`));
                if (snapshot.exists()) await set(ref(pathargataDb, trashPostPath(user.uid, post.id)), buildTrashRecord(snapshot.val(), user.uid));
                await remove(ref(pathargataDb, `public_posts/${post.id}`)).catch(() => undefined);
                await remove(ref(pathargataDb, `friends_post_index/${user.uid}/${post.id}`)).catch(() => undefined);
                await remove(ref(pathargataDb, `user_post_index/${user.uid}/${post.id}`)).catch(() => undefined);
                await remove(ref(pathargataDb, `posts/${post.id}`));
                await invalidateRtdbSnapshotCache([`posts/${post.id}`, "posts", `public_posts/${post.id}`, "public_posts", `user_post_index/${user.uid}`, `friends_post_index/${user.uid}`, `trash_bin/${user.uid}`]);
                onHidden();
                onRefresh();
              } catch { playAppSound("error"); Alert.alert("পোস্ট মুছতে সমস্যা হয়েছে"); }
            })();
          } },
        ]);
      }
    } catch { playAppSound("error"); Alert.alert("এই কাজটি সম্পন্ন করা যায়নি", "আবার চেষ্টা করুন।"); }
    finally { setBusyAction(null); }
  }
  function confirmReport() {
    closeMenu();
    Alert.alert("পোস্ট রিপোর্ট করুন", "কেন রিপোর্ট করতে চান তা moderation team-কে জানানো হবে।", [
      { text: "ফিরে যান", style: "cancel" },
      { text: "রিপোর্ট পাঠান", style: "destructive", onPress: () => void runMenuAction("report") },
    ]);
  }

  const menuActions = [
    ...(ownPost ? [{ icon: "create-outline" as const, title: "পোস্ট পরিচালনা", subtitle: "বিস্তারিত খুলে সম্পাদনা করুন", action: () => runMenuAction("edit") }, { icon: "trash-outline" as const, title: "পোস্ট মুছুন", subtitle: "Trash bin-এ সরিয়ে দিন", danger: true, action: () => runMenuAction("delete") }] : []),
    { icon: "bookmark-outline" as const, title: savedNow ? "সংরক্ষণ থেকে সরান" : "পোস্ট সংরক্ষণ করুন", subtitle: "পরে Saved posts-এ পাবেন", action: () => runMenuAction("save") },
    { icon: "repeat-outline" as const, title: "কমিউনিটিতে রিপোস্ট", subtitle: "ঐচ্ছিক নোট যোগ করে নিশ্চিত করুন", action: openRepost },
    { icon: "notifications-off-outline" as const, title: "পোস্ট মিউট করুন", subtitle: "এই পোস্টের notification বন্ধ করুন", action: () => runMenuAction("mute") },
    { icon: "copy-outline" as const, title: "লেখা কপি", subtitle: "পোস্টের লেখা clipboard-এ নিন", action: () => runMenuAction("copy") },
    { icon: "link-outline" as const, title: "লিংক কপি", subtitle: "পোস্টের সরাসরি link কপি করুন", action: () => runMenuAction("copyLink") },
    { icon: "eye-off-outline" as const, title: "ফিড থেকে আড়াল", subtitle: "শুধু আপনার feed থেকে সরবে", action: () => runMenuAction("hide") },
    ...(!ownPost ? [{ icon: "flag-outline" as const, title: "পোস্ট রিপোর্ট করুন", subtitle: "নিরাপত্তা টিমকে জানান", danger: true, action: confirmReport }] : []),
  ];

  return (
    <View className="mb-4 overflow-hidden border-y border-border bg-surface shadow-sm">
      <View className="flex-row items-center px-4 pt-4 pb-3">
        <TouchableOpacity onPress={openAuthor} accessibilityLabel={`${post.name} এর profile`} className="h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[18px] border border-[#DCE9E0] bg-surface">
          {authorPic ? <Image source={{ uri: authorPic }} className="h-full w-full" resizeMode="cover" /> : <Text className="text-xl font-extrabold text-[#0A6652]">{post.name.slice(0, 1)}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={openAuthor} className="ml-3 min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5"><Text numberOfLines={1} className="shrink text-[16px] font-extrabold text-foreground">{post.name}</Text>{post.authorVerified || post.authorRole === "admin" || post.authorRole === "journalist" ? <Ionicons name="checkmark-circle" size={19} color="#0A8065" /> : null}{ownPost ? <View className="rounded-full bg-surface px-2 py-0.5"><Text className="text-[12px] font-bold text-[#24624F]">আমার পোস্ট</Text></View> : null}</View>
          <View className="mt-1.5 flex-row items-center gap-1"><Text className="text-[13px] text-muted">{post.time}</Text>{post.union || post.village ? <><Text className="text-[13px] text-[#A1AAA3]">·</Text><Text numberOfLines={1} className="flex-1 text-[13px] text-muted">{[post.village, post.union].filter(Boolean).join(" · ")}</Text></> : null}{post.privacy === "friends" ? <Ionicons name="people-outline" size={14} color="#78847C" /> : <Ionicons name="globe-outline" size={14} color="#78847C" />}</View>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="পোস্টের আরও অপশন" accessibilityHint="পোস্ট সংরক্ষণ, রিপোস্ট, আড়াল বা রিপোর্ট করুন" onPress={showMenu} disabled={Boolean(busyAction)} className="ml-2 h-10 w-10 items-center justify-center rounded-2xl bg-surface">
          {busyAction ? <ActivityIndicator size="small" color="#28634F" /> : <Ionicons name="ellipsis-horizontal" size={22} color="#4F5F55" />}
        </TouchableOpacity>
      </View>

      {post.type === "repost" ? <View className="mx-4 mb-2 flex-row items-center gap-1.5 rounded-xl bg-surface px-3 py-2"><Ionicons name="repeat-outline" size={19} color="#24624F" /><Text className="flex-1 text-[13px] text-muted"><Text className="font-extrabold text-[#24624F]">{post.name}</Text> পুনরায় পোস্ট করেছেন <Text className="font-extrabold text-[#24624F]">@{originalAuthor}</Text>-এর পোস্ট</Text></View> : null}
      {post.feeling || post.checkInLocation ? <View className="mx-4 mb-2 flex-row flex-wrap items-center gap-1.5">{post.feeling ? <View className="flex-row items-center gap-1 rounded-full bg-[#F8F0E6] px-2.5 py-1.5"><Text className="text-[15px]">{post.feelingEmoji || "✨"}</Text><Text className="text-[12px] font-semibold text-[#856036]">অনুভব করছেন {post.feeling}</Text></View> : null}{post.checkInLocation ? <View className="flex-row items-center gap-1 rounded-full bg-surface px-2.5 py-1.5"><Ionicons name="location-outline" size={14} color="#24624F" /><Text numberOfLines={1} className="max-w-[180px] text-[12px] font-semibold text-[#24624F]">{post.checkInLocation}</Text></View> : null}</View> : null}
      {post.mobile || post.socialLink ? <View className="mx-4 mb-2 flex-row gap-2">{post.mobile ? <TouchableOpacity onPress={() => void Linking.openURL(`tel:${post.mobile}`)} className="flex-row items-center gap-1.5 rounded-full bg-[#EFF8F1] px-2.5 py-1.5"><Ionicons name="call-outline" size={14} color="#0A8065" /><Text className="text-[11px] font-bold text-[#0A8065]">কল করুন</Text></TouchableOpacity> : null}{post.socialLink ? <TouchableOpacity onPress={() => void Linking.openURL(post.socialLink || "")} className="flex-row items-center gap-1.5 rounded-full bg-[#EEF4FF] px-2.5 py-1.5"><Ionicons name="link-outline" size={14} color="#3C72BA" /><Text className="text-[11px] font-bold text-[#3C72BA]">যোগাযোগের link</Text></TouchableOpacity> : null}</View> : null}
      <TouchableOpacity activeOpacity={0.9} onPress={onOpen} className="px-4 pb-3">
        {post.title && post.title !== post.body ? <Text className="text-[16px] font-extrabold leading-[22px] text-foreground">{post.title}</Text> : null}
        {post.body ? <PostTextBlock post={post} /> : null}
      </TouchableOpacity>
      <View className="mx-4 mb-3"><PostYoutubeCard content={post.youtubeUrl || post.body} title={post.youtubeTitle} /></View>
      {post.type === "repost" ? <TouchableOpacity onPress={openOriginalPost} activeOpacity={0.9} className="mx-4 mb-3 overflow-hidden rounded-2xl border border-border bg-background"><View className="flex-row items-center gap-2 border-b border-border px-3 py-2.5"><View className="h-7 w-7 items-center justify-center overflow-hidden rounded-[10px] bg-surface">{post.originalPostAuthorPic ? <Image source={{ uri: post.originalPostAuthorPic }} className="h-full w-full" /> : <Text className="text-[12px] font-bold text-[#24624F]">{originalAuthor.slice(0, 1)}</Text>}</View><Text numberOfLines={1} className="flex-1 text-[13px] font-extrabold text-foreground">{originalAuthor}</Text><Ionicons name="open-outline" size={18} color="#718078" /></View><View className="px-3 py-2.5">{post.originalPostTitle ? <Text numberOfLines={2} className="text-[14px] font-bold text-foreground">{post.originalPostTitle}</Text> : null}{post.originalPostBody ? <Text numberOfLines={4} className="mt-1 text-[13px] leading-[18px] text-muted">{post.originalPostBody}</Text> : null}{post.originalPostType === "poll" ? <View className="mt-2 flex-row items-center gap-1"><Ionicons name="stats-chart-outline" size={18} color="#24624F" /><Text className="text-[11px] font-semibold text-[#24624F]">মূল পোস্টে poll আছে</Text></View> : null}</View>{post.originalPostAudio ? <FeedMediaPlaceholder kind="audio" onPress={openOriginalPost} /> : originalImages.length ? <PostImageGallery images={originalImages} variant="feed" onDoubleTapLike={() => undefined} /> : null}<View className="flex-row items-center gap-1 border-t border-border px-3 py-2"><Text className="text-[11px] font-bold text-[#24624F]">মূল পোস্ট খুলুন</Text><Ionicons name="arrow-forward" size={13} color="#24624F" /></View></TouchableOpacity> : null}
      {post.type === "poll" && post.options?.length ? <TouchableOpacity onPress={onOpen} activeOpacity={0.9} className="mx-4 mb-3 rounded-2xl border border-border bg-surface p-3"><View className="mb-2 flex-row items-center gap-1.5"><Ionicons name="stats-chart-outline" size={18} color="#0A6652" /><Text className="text-[12px] font-bold text-[#0A6652]">কমিউনিটি পোল · {pollTotal} ভোট</Text></View>{post.options.map((option, index) => { const votes = Number(option.votes) || 0; const percent = pollTotal ? Math.round(votes * 100 / pollTotal) : 0; return <View key={`${index}-${option.text}`} className="mb-2 overflow-hidden rounded-xl border border-[#E2E9E3] bg-surface"><View className="flex-row items-center justify-between px-3 py-2"><Text className="flex-1 pr-2 text-[13px] font-semibold text-foreground">{userVote === index ? "✓ " : ""}{option.text}</Text><Text className="text-[11px] font-bold text-muted">{percent}%</Text></View><View className="h-1 bg-[#ECF1ED]"><View style={{ width: `${percent}%` }} className="h-full bg-[#0A8065]" /></View></View>; })}<Text className="mt-0.5 text-[11px] text-muted">{userVote !== undefined ? "আপনার ভোট দেওয়া হয়েছে" : "বিস্তারিত খুলে ভোট দিন"}</Text></TouchableOpacity> : null}
      {post.audio || post.type === "voice" ? <FeedMediaPlaceholder kind="audio" onPress={onOpen} /> : post.type === "video" || post.mediaType?.toLowerCase().includes("video") ? <FeedMediaPlaceholder kind="video" onPress={onOpen} /> : mediaImages.length ? <PostImageGallery images={mediaImages} variant="feed" onDoubleTapLike={() => { if (!liked) void toggleLike(); }} /> : null}


      <View className="mx-4 flex-row items-center justify-between border-t border-border py-2.5"><View className="flex-row items-center gap-1.5">{showEngagementCounts ? <><View className="h-5 w-5 items-center justify-center rounded-full bg-[#FCECEE]"><Ionicons name="heart" size={13} color="#D45D6A" /></View><Text className="text-[12px] text-muted">{likeCount} পছন্দ</Text><Text className="ml-2 text-[12px] text-muted">{post.commentCount} মন্তব্য</Text></> : null}{post.adminScore ? <Text className="ml-2 text-[11px] font-semibold text-[#A27643]">· নির্বাচিত</Text> : null}</View><TouchableOpacity onPress={onOpen} className="flex-row items-center gap-1"><Text className="text-[12px] font-bold text-[#23624F]">বিস্তারিত</Text><Ionicons name="arrow-forward" size={14} color="#23624F" /></TouchableOpacity></View>
      <View className="mx-4 flex-row border-t border-border py-1.5">
        <FeedAction icon={liked ? "heart" : "heart-outline"} label="পছন্দ" active={liked} disabled={!likeStateLoaded || likeBusy} onPress={() => void toggleLike()} />
        <FeedAction icon="chatbubble-ellipses-outline" label="মন্তব্য" onPress={onOpen} />
        <FeedAction icon="repeat-outline" label="রিপোস্ট" active={post.type === "repost"} disabled={repostOpen} onPress={openRepost} />
        <FeedAction icon={savedNow ? "bookmark" : "bookmark-outline"} label={savedNow ? "সংরক্ষিত" : "সেভ"} active={savedNow} disabled={busyAction === "save"} onPress={() => void runMenuAction("save")} />
      </View>
      {post.commentPreviews?.length ? <View className="mx-4 border-t border-border pt-3">{post.commentPreviews.map((comment: FeedCommentPreview) => <View key={comment.id} className="mb-2 flex-row items-start gap-2"><View className="h-7 w-7 items-center justify-center overflow-hidden rounded-xl bg-surface">{comment.authorPic ? <Image source={{ uri: comment.authorPic }} className="h-full w-full" /> : <Text className="text-[11px] font-bold text-[#24624F]">{comment.author.slice(0, 1)}</Text>}</View><View className="flex-1 rounded-xl bg-surface px-3 py-2"><Text className="text-[13px] leading-[17px] text-foreground" numberOfLines={2}><Text className="font-bold">{comment.author} </Text>{comment.text}</Text></View></View>)}<TouchableOpacity onPress={onOpen} className="mb-2"><Text className="text-[12px] font-bold text-[#0A6652]">{showEngagementCounts ? `সব মন্তব্য দেখুন (${post.commentCount})` : "সব মন্তব্য দেখুন"}</Text></TouchableOpacity></View> : null}
      <View className="mx-4 mb-4 mt-1 flex-row items-center gap-2 rounded-2xl bg-surface p-2"><View className="h-8 w-8 items-center justify-center rounded-xl bg-[#DDECE3]"><Ionicons name="person" size={18} color="#28634F" /></View><TextInput value={commentDraft} onChangeText={setCommentDraft} placeholder="আপনার মতামত লিখুন…" placeholderTextColor="#89948C" className="min-h-9 flex-1 text-[13px] text-foreground" returnKeyType="send" onSubmitEditing={() => void submitComment()} /><TouchableOpacity onPress={() => void submitComment()} disabled={!commentDraft.trim() || commenting} className="h-8 w-8 items-center justify-center rounded-xl bg-[#0B2D26]">{commenting ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="arrow-up" size={18} color="white" />}</TouchableOpacity></View>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={closeMenu} statusBarTranslucent>
        <View className="flex-1 justify-end bg-black/45"><TouchableOpacity accessibilityLabel="বন্ধ করুন" onPress={closeMenu} className="flex-1" activeOpacity={1} /><View className="max-h-[90%] overflow-hidden rounded-t-[30px] border-t border-white bg-surface px-4 pb-4 pt-3"><View className="mb-3 items-center"><View className="h-1 w-11 rounded-full bg-[#D9E0DA]" /></View><View className="mb-3 flex-row items-center border-b border-border px-2 pb-3"><View className="h-10 w-10 items-center justify-center overflow-hidden rounded-[15px] bg-surface">{authorPic ? <Image source={{ uri: authorPic }} className="h-full w-full" /> : <Text className="font-bold text-[#0A6652]">{post.name.slice(0, 1)}</Text>}</View><View className="ml-3 flex-1"><Text className="text-[15px] font-extrabold text-foreground">পোস্টের অপশন</Text><Text numberOfLines={1} className="mt-0.5 text-[12px] text-muted">{post.name} · {post.time}</Text></View><TouchableOpacity onPress={closeMenu} className="h-9 w-9 items-center justify-center rounded-full bg-surface"><Ionicons name="close" size={19} color="#58665C" /></TouchableOpacity></View><ScrollView style={{ maxHeight: "68%" }} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">{menuActions.map((item) => <MenuRow key={item.title} icon={item.icon} title={item.title} subtitle={item.subtitle} danger={"danger" in item ? item.danger : false} onPress={item.action} />)}</ScrollView><View className="mt-2 border-t border-border pt-2"><TouchableOpacity onPress={closeMenu} className="items-center rounded-2xl bg-surface py-3.5"><Text className="text-[14px] font-bold text-[#536158]">বাতিল</Text></TouchableOpacity></View></View></View>
      </Modal>
      <RepostComposer visible={repostOpen} author={post.type === "repost" ? originalAuthor : post.name} authorPic={post.type === "repost" ? post.originalPostAuthorPic : authorPic} title={post.type === "repost" ? post.originalPostTitle || "" : post.title} body={post.type === "repost" ? post.originalPostBody || "" : post.body} onClose={() => setRepostOpen(false)} onConfirm={confirmRepost} />
    </View>
  );
}
function areCommunityPostsEqual(previous: Readonly<Props>, next: Readonly<Props>) {
  return previous.post === next.post
    && previous.isSaved === next.isSaved
    && previous.allowAuthorLookup === next.allowAuthorLookup
    && previous.showEngagementCounts === next.showEngagementCounts
    && previous.onOpen === next.onOpen
    && previous.onRefresh === next.onRefresh
    && previous.onHidden === next.onHidden;
}

export const CommunityPostCard = memo(CommunityPostCardComponent, areCommunityPostsEqual);

function FeedAction({ icon, label, active = false, disabled = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; disabled?: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} activeOpacity={0.75} hitSlop={4} onPress={onPress} disabled={disabled} className={`min-h-12 flex-1 flex-row items-center justify-center gap-1.5 px-1 py-2 ${disabled ? "opacity-60" : ""}`}><Ionicons name={icon} size={20} color={active ? "#0A8065" : "#718078"} /><Text numberOfLines={1} className={`text-[13px] font-semibold ${active ? "text-[#0A8065]" : "text-muted"}`}>{label}</Text></TouchableOpacity>;
}
