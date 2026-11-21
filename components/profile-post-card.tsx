import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ExpoLinking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { PostImageGallery, PostRichMedia, PostYoutubeCard } from "@/components/post-rich-media";
import { RepostComposer } from "@/components/repost-composer";
import { addPostComment, repostPost, reportPost, toggleMutedPost, togglePostLike, toggleSavedPost } from "@/lib/post-interactions";
import { pathargataAuth } from "@/lib/pathargata-firebase";
import { deleteOwnPost as deletePostFromTrash } from "@/lib/trash-bin";
import { parsePostMediaContent } from "@/lib/post-media";
import { getPostBackgroundColors } from "@/lib/post-background";

export type ProfilePostData = {
  id: string;
  uid?: string;
  author?: string;
  userName?: string;
  authorPic?: string | null;
  authorRole?: string;
  authorVerified?: boolean;
  title?: string;
  body?: string;
  content?: string;
  description?: string;
  text?: string;
  timestamp?: number;
  image?: string;
  images?: string[] | Record<string, string>;
  audio?: string;
  mediaType?: string;
  type?: string;
  repostMessage?: string;
  originalPostId?: string;
  originalPostAuthor?: string;
  originalPostAuthorUid?: string;
  originalPostAuthorPic?: string;
  originalPostTitle?: string;
  originalPostBody?: string;
  originalPostImages?: string[] | Record<string, string>;
  originalPostAudio?: string;
  originalPostType?: string;
  originalPostMediaType?: string;
  union?: string;
  village?: string;
  feeling?: string | { text?: string; emoji?: string };
  feelingEmoji?: string;
  checkInLocation?: string;
  bgColor?: string;
  mobile?: string;
  socialLink?: string;
  youtubeUrl?: string;
  youtubeTitle?: string;
  likes?: Record<string, unknown>;
  comments?: Record<string, Record<string, unknown>>;
  likeCount?: number;
  commentCount?: number;
  commentPreviews?: { id: string; author?: string; authorUid?: string; authorPic?: string | null; text?: string }[];
  options?: { text: string; votes?: number }[];
  voters?: Record<string, number>;
  privacy?: string;
};

type Props = {
  post: ProfilePostData;
  profileName: string;
  profilePhoto?: string;
  isSaved?: boolean;
  showEngagementCounts?: boolean;
  onDeleted?: (postId: string) => void;
};

function getImages(post: Pick<ProfilePostData, "images" | "image">) {
  const raw = post.images ?? (post.image ? [post.image] : []);
  return Array.isArray(raw) ? raw.filter((src) => typeof src === "string" && src.length > 0) : Object.values(raw).filter((src) => typeof src === "string" && src.length > 0);
}
function dateLabel(timestamp?: number) {
  if (!timestamp) return "সময় উল্লেখ নেই";
  return new Date(timestamp).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
}

function ProfilePostText({ body, bgColor, expanded, onToggle }: { body: string; bgColor?: string; expanded: boolean; onToggle: () => void }) {
  const colors = getPostBackgroundColors(bgColor);
  const content = <><Text numberOfLines={expanded ? undefined : 5} className={`text-[15px] leading-[22px] ${colors ? "font-semibold text-white" : "text-foreground"}`}>{body}</Text>{body.length > 280 ? <TouchableOpacity onPress={onToggle} className="mt-2 self-start"><Text className={`text-[13px] font-extrabold ${colors ? "text-white" : "text-[#0A6652]"}`}>{expanded ? "কম দেখান" : "আরও দেখুন"}</Text></TouchableOpacity> : null}</>;
  return colors ? <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="mx-4 mb-4 mt-1 overflow-hidden rounded-2xl"><View className="px-4 pb-3 pt-2">{content}</View></LinearGradient> : <View className="px-4 pb-4 pt-1">{content}</View>;
}

export function ProfilePostCard({ post, profileName, profilePhoto, isSaved = false, showEngagementCounts = true, onDeleted }: Props) {
  const uid = pathargataAuth.currentUser?.uid;
  const ownPost = Boolean(uid && post.uid === uid);
  const author = post.author || post.userName || profileName || "পাথরঘাটা কমিউনিটি";
  const originalAuthor = post.originalPostAuthor || "মূল লেখক";
  const avatar = post.authorPic || profilePhoto || pathargataAuth.currentUser?.photoURL || undefined;
  const images = getImages(post);
  const comments = post.commentPreviews
    ? post.commentPreviews.map((comment) => [comment.id, comment] as const).reverse()
    : Object.entries(post.comments || {}).slice(-2).reverse();
  const [liked, setLiked] = useState(Boolean(uid && post.likes?.[uid]));
  const [likeCount, setLikeCount] = useState(Number.isFinite(post.likeCount) ? Number(post.likeCount) : Object.keys(post.likes || {}).length);
  const commentCount = Number.isFinite(post.commentCount) ? Number(post.commentCount) : Object.keys(post.comments || {}).length;
  const pollTotal = post.options?.reduce((sum, option) => sum + (Number(option.votes) || 0), 0) || 0;
  const userVote = uid ? post.voters?.[uid] : undefined;
  const feelingValue = typeof post.feeling === "string" ? { text: post.feeling, emoji: post.feelingEmoji || "✨" } : post.feeling;
  const saved = isSaved;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);

  function openPost() {
    router.push({ pathname: "/post/[id]" as any, params: { id: post.id } });
  }
  async function like() {
    if (!uid) { router.push("/auth"); return; }
    if (busy) return;
    const previous = liked;
    setBusy(true);
    setLiked(!previous);
    setLikeCount((value) => Math.max(0, value + (previous ? -1 : 1)));
    try {
      const next = await togglePostLike(post.id);
      setLiked(next);
    } catch {
      setLiked(previous);
      setLikeCount((value) => Math.max(0, value + (previous ? 1 : -1)));
      Alert.alert("লাইক দেওয়া যায়নি", "আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }
  async function comment() {
    const text = draft.trim();
    if (!text) return;
    if (!uid) { router.push("/auth"); return; }
    setCommentBusy(true);
    try {
      await addPostComment(post.id, text);
      setDraft("");
      Alert.alert("মন্তব্য যোগ হয়েছে", "আপনার মন্তব্য পোস্টে দেখা যাবে।");
    } catch {
      Alert.alert("মন্তব্য যোগ হয়নি", "আবার চেষ্টা করুন।");
    } finally { setCommentBusy(false); }
  }
  async function savePost() {
    if (!uid) { router.push("/auth"); return; }
    setBusy(true);
    try {
      const next = await toggleSavedPost(post.id);
      Alert.alert(next ? "সংরক্ষণ করা হয়েছে" : "সংরক্ষণ থেকে সরানো হয়েছে");
    } catch { Alert.alert("সংরক্ষণ করা যায়নি", "আবার চেষ্টা করুন।"); }
    finally { setBusy(false); }
  }
  function openRepost() {
    if (!uid) { router.push("/auth"); return; }
    if (post.privacy && post.privacy !== "public" && post.privacy !== "everyone") { Alert.alert("এই পোস্টটি রিপোস্ট করা যাবে না", "মূল লেখক পোস্টটি Friends-only বা private রেখেছেন।"); return; }
    setRepostOpen(true);
  }
  async function confirmRepost(message: string) {
    try {
      await repostPost(post.id, message);
      setRepostOpen(false);
      Alert.alert("রিপোস্ট সম্পন্ন", "মূল লেখকের নামসহ পোস্টটি Community Feed-এ যোগ হয়েছে।");
    } catch (error) {
      Alert.alert("রিপোস্ট করা যায়নি", error instanceof Error && error.message === "POST_NOT_PUBLIC" ? "মূল লেখক পোস্টটি public রাখেননি।" : "আবার চেষ্টা করুন।");
      throw new Error("REPOST_FAILED");
    }
  }
  async function deleteOwnPost() {
    const currentUid = pathargataAuth.currentUser?.uid;
    if (!currentUid || post.uid !== currentUid) return;
    setMenuOpen(false);
    Alert.alert("পোস্ট মুছবেন?", "পোস্টটি trash bin-এ রেখে profile ও feed থেকে সরানো হবে।", [
      { text: "বাতিল", style: "cancel" },
      { text: "পোস্ট মুছুন", style: "destructive", onPress: () => void (async () => {
        setMenuBusy(true);
        try {
          await deletePostFromTrash(post.id, currentUid);
          onDeleted?.(post.id);
          Alert.alert("পোস্ট মুছে ফেলা হয়েছে", "পোস্টটি Trash bin-এ রাখা হয়েছে এবং আপনার publication list থেকে সরানো হয়েছে।");
        } catch { Alert.alert("পোস্ট মুছতে সমস্যা হয়েছে", "ডেটা মুছে ফেলা যায়নি। আবার চেষ্টা করুন।"); }
        finally { setMenuBusy(false); }
      })() },
    ]);
  }
  function showOptions() { setMenuOpen(true); }
  function openEdit() {
    setMenuOpen(false);
    router.push({ pathname: "/post/[id]" as any, params: { id: post.id, edit: "1" } });
  }
  function copyPost() { setMenuOpen(false); void Clipboard.setStringAsync([title, body].filter(Boolean).join("\n")).then(() => Alert.alert("কপি হয়েছে", "পোস্টের লেখা clipboard-এ কপি হয়েছে.")); }
  function copyPostLink() { setMenuOpen(false); void Clipboard.setStringAsync(ExpoLinking.createURL(`/post/${post.id}`)).then(() => Alert.alert("কপি হয়েছে", "পোস্টের link clipboard-এ কপি হয়েছে.")); }
  function toggleMuteFromMenu() { setMenuOpen(false); void toggleMutedPost(post.id).then((muted) => Alert.alert(muted ? "পোস্ট মিউট হয়েছে" : "পোস্টের মিউট তুলে নেওয়া হয়েছে")).catch(() => Alert.alert("এখন করা যায়নি")); }
  function reportFromMenu() { setMenuOpen(false); Alert.alert("পোস্ট রিপোর্ট করবেন?", "এই পোস্ট moderation team-কে পাঠাবেন?", [{ text: "বাতিল", style: "cancel" }, { text: "রিপোর্ট", style: "destructive", onPress: () => void reportPost(post.id, "ব্যবহারকারীর রিপোর্ট").then(() => Alert.alert("রিপোর্ট পাঠানো হয়েছে")).catch(() => Alert.alert("পোস্ট রিপোর্ট পাঠানো যায়নি")) }]); }

  const rawBody = post.type === "repost" ? post.repostMessage || post.content || "" : post.description || post.content || post.body || post.text || "";
  const parsedBody = parsePostMediaContent(rawBody);
  const body = parsedBody.youtubeId ? parsedBody.text : rawBody;
  const title = post.youtubeTitle || (post.title && !parsePostMediaContent(post.title).youtubeId && post.title !== body ? post.title : "");
  const initials = author.trim().slice(0, 1) || "পা";
  return (
    <View className="mb-4 overflow-hidden border-y border-border bg-surface shadow-sm">
      <View className="flex-row items-center px-4 pt-4 pb-3">
        <TouchableOpacity onPress={openPost} className="h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-emerald-100 bg-surface">
          {avatar ? <Image source={{ uri: avatar }} className="h-full w-full" resizeMode="cover" /> : <Text className="text-lg font-extrabold text-[#0A6652]">{initials}</Text>}
        </TouchableOpacity>
        <View className="ml-3 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-sm font-bold text-foreground" numberOfLines={1}>{author}</Text>
            {post.authorVerified || post.authorRole === "admin" || post.authorRole === "journalist" ? <Ionicons name="checkmark-circle" size={18} color="#0D8B6F" /> : null}
            {ownPost ? <View className="rounded-full bg-[#EDF7F2] px-2 py-0.5"><Text className="text-[11px] font-bold uppercase tracking-wider text-[#0A6652]">আমার পোস্ট</Text></View> : null}
          </View>
          <Text className="mt-1 text-[12px] text-muted">{dateLabel(post.timestamp)}{post.union ? ` · ${post.union}` : ""}{post.village ? ` · ${post.village}` : ""}</Text>
        </View>
        <TouchableOpacity onPress={showOptions} accessibilityLabel="পোস্ট অপশন" className="h-9 w-9 items-center justify-center rounded-full bg-surface"><Ionicons name="ellipsis-horizontal" size={20} color="#5C6B62" /></TouchableOpacity>
      </View>
      {post.type === "repost" ? <View className="mx-4 mb-2 flex-row items-center gap-1.5 rounded-xl bg-[#F1F6F2] px-3 py-2"><Ionicons name="repeat-outline" size={18} color="#24624F"/><Text className="text-[12px] text-muted"><Text className="font-bold text-[#24624F]">{author}</Text> পুনরায় পোস্ট করেছেন <Text className="font-bold text-[#24624F]">@{originalAuthor}</Text>-এর পোস্ট</Text></View> : null}
      {feelingValue || post.checkInLocation ? <View className="mx-4 mb-2 flex-row flex-wrap items-center gap-1.5">{feelingValue ? <View className="flex-row items-center gap-1 rounded-full bg-[#F6F0E8] px-2.5 py-1"><Text className="text-[14px]">{feelingValue.emoji || "✨"}</Text><Text className="text-[11px] font-semibold text-[#805627]">অনুভব করছেন {feelingValue.text}</Text></View> : null}{post.checkInLocation ? <View className="flex-row items-center gap-1 rounded-full bg-[#EDF5F0] px-2.5 py-1"><Ionicons name="location-outline" size={13} color="#0A6652"/><Text className="text-[11px] font-semibold text-[#0A6652]">{post.checkInLocation}</Text></View> : null}</View> : null}
      {post.mobile || post.socialLink ? <View className="mx-4 mb-2 flex-row gap-2">{post.mobile ? <TouchableOpacity onPress={() => void Linking.openURL(`tel:${post.mobile}`)} className="flex-row items-center gap-1.5 rounded-full bg-[#EFF8F1] px-2.5 py-1.5"><Ionicons name="call-outline" size={14} color="#0A8065" /><Text className="text-[11px] font-bold text-[#0A8065]">কল করুন</Text></TouchableOpacity> : null}{post.socialLink ? <TouchableOpacity onPress={() => void Linking.openURL(post.socialLink || "")} className="flex-row items-center gap-1.5 rounded-full bg-[#EEF4FF] px-2.5 py-1.5"><Ionicons name="link-outline" size={14} color="#3C72BA" /><Text className="text-[11px] font-bold text-[#3C72BA]">যোগাযোগের link</Text></TouchableOpacity> : null}</View> : null}
      {title ? <Text className="mx-4 text-[16px] font-bold leading-6 text-foreground">{title}</Text> : null}
      {body ? <ProfilePostText body={body} bgColor={post.bgColor} expanded={bodyExpanded} onToggle={() => setBodyExpanded((value) => !value)} /> : !images.length && !post.audio && !title ? <Text className="px-4 pb-4 text-sm italic text-muted">এই পোস্টে লেখা নেই।</Text> : null}
      <View className="mx-4 mb-3"><PostYoutubeCard content={post.youtubeUrl || rawBody} title={post.youtubeTitle} /></View>
      {post.type === "repost" ? <TouchableOpacity onPress={() => post.originalPostId && router.push({ pathname: "/post/[id]" as any, params: { id: post.originalPostId } })} className="mx-4 mb-3 overflow-hidden rounded-2xl border border-border bg-background"><View className="flex-row items-center gap-2 border-b border-border px-3 py-2.5"><View className="h-7 w-7 items-center justify-center overflow-hidden rounded-[10px] bg-surface">{post.originalPostAuthorPic ? <Image source={{ uri: post.originalPostAuthorPic }} className="h-full w-full"/> : <Text className="text-[12px] font-bold text-[#24624F]">{originalAuthor.slice(0, 1)}</Text>}</View><Text className="flex-1 text-[13px] font-extrabold text-foreground">{originalAuthor}</Text><Ionicons name="open-outline" size={18} color="#718078"/></View>{post.originalPostTitle ? <Text className="px-3 pt-2.5 text-[14px] font-bold text-foreground">{post.originalPostTitle}</Text> : null}{post.originalPostBody ? <Text numberOfLines={4} className="px-3 py-2 text-[13px] leading-[18px] text-muted">{post.originalPostBody}</Text> : null}{post.originalPostAudio ? <PostRichMedia type={post.originalPostType} audio={post.originalPostAudio} images={getImages({ images: post.originalPostImages })} mediaType={post.originalPostMediaType} content={post.originalPostBody} onDoubleTapLike={() => undefined}/> : getImages({ images: post.originalPostImages }).length ? <PostImageGallery images={getImages({ images: post.originalPostImages })} variant="feed" onDoubleTapLike={() => undefined}/> : null}</TouchableOpacity> : null}
      {post.type === "poll" && post.options?.length ? <TouchableOpacity activeOpacity={0.9} onPress={openPost} className="mx-4 mb-4 rounded-2xl border border-border bg-surface p-3"><View className="mb-2 flex-row items-center gap-1.5"><Ionicons name="stats-chart-outline" size={18} color="#0A6652"/><Text className="text-[12px] font-bold uppercase tracking-wider text-[#0A6652]">কমিউনিটি পোল · {pollTotal} ভোট</Text></View>{post.options.map((option, index) => { const votes = Number(option.votes) || 0; const percent = pollTotal ? Math.round(votes * 100 / pollTotal) : 0; const selected = userVote === index; return <View key={`${index}-${option.text}`} className="mb-2 overflow-hidden rounded-xl border border-border bg-surface"><View className="flex-row items-center justify-between px-3 py-2"><Text className="flex-1 pr-3 text-[13px] font-semibold text-foreground">{selected ? "✓ " : ""}{option.text}</Text><Text className="text-[11px] font-bold text-muted">{percent}%</Text></View><View className="h-1 bg-[#EDF2EE]"><View style={{ width: `${percent}%` }} className="h-full bg-[#0A8065]" /></View></View>; })}<Text className="mt-1 text-[11px] text-muted">{userVote !== undefined ? "আপনার ভোট দেওয়া হয়েছে" : "বিস্তারিত খুলে ভোট দিন"}</Text></TouchableOpacity> : null}
      {post.audio || post.type === "voice" ? <PostRichMedia type={post.type} audio={post.audio} images={images} mediaType={post.mediaType} content={body} onDoubleTapLike={() => { if (!liked) void like(); }} /> : images.length ? <PostImageGallery images={images} variant="feed" onDoubleTapLike={() => { if (!liked) void like(); }} /> : null}
      <View className="mx-4 mt-3 flex-row items-center justify-between border-t border-border pt-3">
        {showEngagementCounts ? <View className="flex-row items-center gap-1.5"><Ionicons name="heart" size={18} color="#F06A78"/><Text className="text-[13px] text-muted">{likeCount} পছন্দ</Text><Text className="ml-2 text-[13px] text-muted">{commentCount} মন্তব্য</Text></View> : <View />}
        <TouchableOpacity onPress={openPost} className="flex-row items-center gap-1"><Ionicons name="open-outline" size={18} color="#0A6652"/><Text className="text-[12px] font-semibold text-[#0A6652]">বিস্তারিত</Text></TouchableOpacity>
      </View>
      <View className="mx-4 mt-2 flex-row items-center justify-between border-t border-border py-2">
        <Action icon={liked ? "heart" : "heart-outline"} label="লাইক" active={liked} disabled={busy} onPress={() => void like()} />
        <Action icon="chatbubble-ellipses-outline" label="মন্তব্য" disabled={busy} onPress={openPost} />
        <Action icon="repeat-outline" label="রিপোস্ট" disabled={busy} onPress={openRepost} />
        <Action icon={saved ? "bookmark" : "bookmark-outline"} label={saved ? "সেভড" : "সেভ"} active={saved} disabled={busy} onPress={() => void savePost()} />
      </View>
      {comments.length ? <View className="mx-4 mb-2 border-t border-border pt-3">{comments.map(([id, value]) => <View key={id} className="mb-2 flex-row items-start gap-2"><View className="h-7 w-7 items-center justify-center overflow-hidden rounded-xl bg-[#EDF7F2]">{typeof value.authorPic === "string" ? <Image source={{ uri: value.authorPic }} className="h-full w-full" /> : <Text className="text-[12px] font-bold text-[#0A6652]">{String(value.author || "U").slice(0, 1)}</Text>}</View><View className="flex-1 rounded-xl bg-surface px-3 py-2"><Text className="text-[14px] leading-[18px] text-foreground"><Text className="font-bold">{String(value.author || "সদস্য")} </Text>{String(value.text || "")}</Text></View></View>)}<TouchableOpacity onPress={openPost} className="py-1"><Text className="text-[13px] font-semibold text-[#0A6652]">সব মন্তব্য দেখুন</Text></TouchableOpacity></View> : null}
      <View className="mx-4 mb-4 mt-1 flex-row items-center gap-2 rounded-2xl bg-surface p-2">
        <View className="h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-surface">{profilePhoto ? <Image source={{ uri: profilePhoto }} className="h-full w-full" /> : <Text className="text-xs font-bold text-[#0A6652]">{initials}</Text>}</View>
        <TextInput value={draft} onChangeText={setDraft} placeholder="একটি মন্তব্য লিখুন…" placeholderTextColor="#849087" className="min-h-9 flex-1 text-[14px] text-foreground" returnKeyType="send" onSubmitEditing={() => void comment()} />
        <TouchableOpacity onPress={() => void comment()} disabled={!draft.trim() || commentBusy} className="h-8 w-8 items-center justify-center rounded-xl bg-[#0A6652]">{commentBusy ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="arrow-up" size={18} color="white" />}</TouchableOpacity>
      </View>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View className="flex-1 justify-end bg-black/45"><TouchableOpacity className="flex-1" activeOpacity={1} onPress={() => setMenuOpen(false)} /><View className="max-h-[90%] overflow-hidden rounded-t-[30px] border-t border-border bg-surface px-4 pb-4 pt-3">
          <View className="mb-4 items-center"><View className="h-1 w-12 rounded-full bg-border" /></View>
          <View className="mb-3 flex-row items-center border-b border-border px-1 pb-3"><View className="h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-green-100">{avatar ? <Image source={{ uri: avatar }} className="h-full w-full" /> : <Text className="font-bold text-primary">{initials}</Text>}</View><View className="ml-3 flex-1"><Text className="text-base font-extrabold text-foreground">পোস্টের অপশন</Text><Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>{author}</Text></View><TouchableOpacity onPress={() => setMenuOpen(false)} className="h-9 w-9 items-center justify-center rounded-full bg-background"><Ionicons name="close" size={19} color="#64748B" /></TouchableOpacity></View>
          <ScrollView style={{ maxHeight: "68%" }} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
            <ProfileMenuRow icon="open-outline" title="পোস্ট খুলুন" subtitle="বিস্তারিত, মন্তব্য ও পূর্ণ media দেখুন" onPress={() => { setMenuOpen(false); openPost(); }} />
            {ownPost ? <><ProfileMenuRow icon="create-outline" title="পোস্ট সম্পাদনা করুন" subtitle="শিরোনাম ও লেখার সম্পূর্ণ edit screen" onPress={openEdit} /><ProfileMenuRow icon="trash-outline" title="পোস্ট মুছুন" subtitle={menuBusy ? "মুছে ফেলা হচ্ছে…" : "Trash bin-এ রেখে সরিয়ে দিন"} danger onPress={() => void deleteOwnPost()} /></> : null}
            <ProfileMenuRow icon="bookmark-outline" title={saved ? "সংরক্ষণ থেকে সরান" : "পোস্ট সংরক্ষণ করুন"} subtitle="পরে Saved posts-এ পাবেন" onPress={() => { setMenuOpen(false); void savePost(); }} />
            <ProfileMenuRow icon="repeat-outline" title="কমিউনিটিতে রিপোস্ট" subtitle="নিজের নোটসহ শেয়ার করুন" onPress={openRepost} />
            <ProfileMenuRow icon="copy-outline" title="লেখা কপি করুন" subtitle="পোস্টের লেখা clipboard-এ নিন" onPress={copyPost} />
            <ProfileMenuRow icon="link-outline" title="লিংক কপি করুন" subtitle="পোস্টের সরাসরি link কপি করুন" onPress={copyPostLink} />
            <ProfileMenuRow icon="notifications-off-outline" title="পোস্ট মিউট করুন" subtitle="এই পোস্টের notification বন্ধ করুন" onPress={toggleMuteFromMenu} />
            {!ownPost ? <ProfileMenuRow icon="flag-outline" title="পোস্ট রিপোর্ট করুন" subtitle="Moderation team-কে জানান" danger onPress={reportFromMenu} /> : null}
          </ScrollView>
          <View className="mt-2 border-t border-border pt-2"><TouchableOpacity onPress={() => setMenuOpen(false)} className="items-center rounded-2xl bg-background py-3.5"><Text className="font-bold text-muted">বাতিল</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
      <RepostComposer visible={repostOpen} author={post.type === "repost" ? originalAuthor : author} authorPic={post.type === "repost" ? post.originalPostAuthorPic : avatar} title={post.type === "repost" ? post.originalPostTitle || "" : title || post.title || ""} body={post.type === "repost" ? post.originalPostBody || "" : body} onClose={() => setRepostOpen(false)} onConfirm={confirmRepost} />
    </View>
  );
}

function ProfileMenuRow({ icon, title, subtitle, danger = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; danger?: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} className="flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-background"><View className={`h-10 w-10 items-center justify-center rounded-xl ${danger ? "bg-red-50" : "bg-background"}`}><Ionicons name={icon} size={19} color={danger ? "#B91C1C" : "#0A6652"} /></View><View className="flex-1"><Text className={`text-[15px] font-bold ${danger ? "text-red-700" : "text-foreground"}`}>{title}</Text><Text className="mt-0.5 text-xs text-muted">{subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color="#A1AAA3" /></TouchableOpacity>;
}

function Action({ icon, label, active = false, disabled = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; disabled?: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} activeOpacity={0.75} hitSlop={4} onPress={onPress} disabled={disabled} className={`min-h-12 flex-1 flex-row items-center justify-center gap-1.5 px-1 py-2 ${disabled ? "opacity-60" : ""}`}><Ionicons name={icon} size={20} color={active ? "#0A8065" : "#6F7C73"} /><Text numberOfLines={1} className={`text-[13px] font-semibold ${active ? "text-[#0A8065]" : "text-muted"}`}>{label}</Text></TouchableOpacity>;
}
