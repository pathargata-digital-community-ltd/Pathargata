import { safeGoBack } from "@/lib/safe-navigation";
import { invalidateRtdbSnapshotCache, onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import * as Haptics from "expo-haptics";
import { get, onValue as onFirebaseValue, push, ref, remove, runTransaction, set, update } from "firebase/database";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { PostRichMedia } from "@/components/post-rich-media";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { recordFeedInteraction } from "@/lib/feed-preferences";
import { togglePostLike } from "@/lib/post-interactions";
import { parsePostMediaContent } from "@/lib/post-media";
import { getFriendshipStatus } from "@/lib/social";
import { deleteOwnPost } from "@/lib/trash-bin";

type PostData = {
  uid?: string;
  author?: string;
  authorPic?: string;
  title?: string;
  content?: string;
  description?: string;
  text?: string;
  timestamp?: number;
  likes?: Record<string, unknown>;
  comments?: Record<string, unknown>;
  type?: string;
  images?: unknown;
  image?: unknown;
  mediaType?: string;
  audio?: string;
  videoUrl?: string;
  youtubeUrl?: string;
  youtubeTitle?: string;
  feeling?: string | { text?: string; emoji?: string };
  feelingEmoji?: string;
  checkInLocation?: string;
  privacy?: string;
  mobile?: string;
  socialLink?: string;
  bgColor?: string;
  options?: { text: string; votes?: number }[];
  voters?: Record<string, number>;
};
type CommentData = {
  id: string;
  author?: string;
  authorUid?: string;
  authorPic?: string | null;
  authorRole?: string;
  text: string;
  time?: number;
  parentId?: string;
  replyingTo?: string;
  likes?: Record<string, unknown>;
};
type CommentAction = "copy" | "delete" | "report";

function timeLabel(timestamp?: number) {
  if (!timestamp) return "সাম্প্রতিক";
  return new Date(timestamp).toLocaleString("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PostDetailScreen() {
  const { id, title, edit } = useLocalSearchParams<{ id: string; title?: string; edit?: string }>();
  const [post, setPost] = useState<PostData | null>(null);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<CommentData | null>(null);
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [activeCommentMenu, setActiveCommentMenu] = useState<CommentData | null>(null);
  const editOpenedRef = useRef(false);
  const canReadPostEngagement = Boolean(post && !accessDenied);

  useEffect(() => {
    editOpenedRef.current = false;
  }, [id]);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    return onValue(
      ref(pathargataDb, `posts/${id}`),
      (snapshot) => {
        const value = snapshot.val() as PostData | null;
        void (async () => {
          const currentUid = pathargataAuth.currentUser?.uid;
          const privacy = (value?.privacy || "public").toLocaleLowerCase();
          const isOwner = Boolean(currentUid && value?.uid === currentUid);
          const isOnlyMe = ["only_me", "only-me", "private"].includes(privacy);
          const isFriendsOnly = ["friends", "friends_only", "friends-only"].includes(privacy);
          const isFriend = !isOwner && isFriendsOnly && value?.uid ? (await getFriendshipStatus(value.uid)) === "friend" : false;
          if (!value || (isOnlyMe && !isOwner) || (isFriendsOnly && !isOwner && !isFriend)) {
            setPost(null);
            setAccessDenied(Boolean(value));
            setError(value ? "এই পোস্টটি আপনার জন্য প্রকাশিত নয়।" : "");
            setLoading(false);
            return;
          }
          setAccessDenied(false);
          setPost(value);
          if (edit === "1" && !editOpenedRef.current && currentUid && value.uid === currentUid) {
            editOpenedRef.current = true;
            setEditTitle(value.title || "");
            setEditText(value.content || value.description || value.text || "");
            setEditingPost(true);
          }
          setLoading(false);
        })();
      },
      () => {
        setError("পোস্ট লোড করা যায়নি।");
        setLoading(false);
      },
    );
  }, [edit, id]));

  useFocusEffect(useCallback(() => {
    if (!id || !canReadPostEngagement) return;
    return onFirebaseValue(ref(pathargataDb, `posts/${id}/likes`), (snapshot) => {
      const likes = (snapshot.val() || {}) as Record<string, unknown>;
      const currentUid = pathargataAuth.currentUser?.uid;
      setLikeCount(Object.values(likes).filter((value) => value === true).length);
      setLiked(Boolean(currentUid && likes[currentUid] === true));
    });
  }, [canReadPostEngagement, id]));

  useFocusEffect(useCallback(() => {
    if (!id || accessDenied) return;
    return onValue(ref(pathargataDb, `posts/${id}/comments`), (snapshot) => {
      const raw = (snapshot.val() || {}) as Record<
        string,
        Omit<CommentData, "id">
      >;
        setComments(
        Object.entries(raw)
          .map(([commentId, value]) => ({ id: commentId, ...value }))
          .sort((a, b) => (a.time || 0) - (b.time || 0)),
        );
    });
  }, [accessDenied, id]));

  const mainComments = useMemo(
    () => comments.filter((comment) => !comment.parentId),
    [comments],
  );
  const repliesFor = (commentId: string) =>
    comments.filter((comment) => comment.parentId === commentId);

  async function handleLike() {
    if (!id) return;
    if (!pathargataAuth.currentUser) {
      router.push("/auth");
      return;
    }
    if (likeBusy) return;
    setLikeBusy(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    try {
      const next = await togglePostLike(id);
      setLiked(next);
    } catch {
      setLiked(wasLiked);
      setError("Like update করা যায়নি।");
    } finally {
      setLikeBusy(false);
    }
  }

  async function votePoll(optionIndex: number) {
    const user = pathargataAuth.currentUser;
    if (!id || !user) { router.push("/auth"); return; }
    if (post?.voters?.[user.uid] !== undefined) return;
    try {
      const vote = await runTransaction(ref(pathargataDb, `posts/${id}/voters/${user.uid}`), (current) => current === null ? optionIndex : undefined);
      if (!vote.committed) { setError("আপনি ইতিমধ্যে ভোট দিয়েছেন।"); return; }
      await runTransaction(ref(pathargataDb, `posts/${id}/options/${optionIndex}/votes`), (current) => (Number(current) || 0) + 1);
      await recordFeedInteraction(user.uid, { uid: post?.uid, title: post?.title, body: post?.description || post?.content || post?.text, type: post?.type }, "vote");
    } catch { setError("ভোট দেওয়া যায়নি। আবার চেষ্টা করুন।"); }
  }

  function handleDoubleTapLike() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
    if (!liked) void handleLike();
  }

  async function savePostEdit() {
    const user = pathargataAuth.currentUser;
    if (!user || !id || user.uid !== post?.uid) {
      setError("শুধু নিজের পোস্ট সম্পাদনা করা যাবে।");
      return;
    }
    if (!editText.trim()) {
      setError("পোস্টের লেখা খালি রাখা যাবে না।");
      return;
    }
    try {
      const values = { title: editTitle.trim(), content: editText.trim() };
      await update(ref(pathargataDb, `posts/${id}`), values);
      if (["public", "everyone"].includes((post.privacy || "public").toLocaleLowerCase())) await update(ref(pathargataDb, `public_posts/${id}`), values);
      await invalidateRtdbSnapshotCache([`posts/${id}`, "posts", `public_posts/${id}`, "public_posts", `user_post_index/${user.uid}`]);
      setPost((current) => current ? { ...current, ...values } : current);
      setEditingPost(false);
      setError("");
    } catch { setError("পোস্ট সম্পাদনা করা যায়নি।"); }
  }

  function showPostActions() {
    const user = pathargataAuth.currentUser;
    if (!user || !post) return;
    const ownPost = Boolean(user && post?.uid === user.uid);
    Alert.alert("পোস্ট অপশন", "করণীয় নির্বাচন করুন", [
      { text: "লেখা কপি", onPress: () => void Clipboard.setStringAsync(postBody).then(() => Alert.alert("কপি হয়েছে", "পোস্টের লেখা clipboard-এ কপি হয়েছে।")) },
      { text: "পোস্ট লিংক কপি", onPress: () => void Clipboard.setStringAsync(Linking.createURL(`/post/${id}`)).then(() => Alert.alert("কপি হয়েছে", "পোস্টের link কপি হয়েছে।")) },
      ...(ownPost ? [
        { text: "সম্পাদনা", onPress: () => { setEditTitle(post?.title || ""); setEditText(postBody); setEditingPost(true); } },
          { text: "পোস্ট মুছুন", style: "destructive" as const, onPress: () => Alert.alert("পোস্ট মুছবেন?", "পোস্টটি trash bin-এ রেখে feed থেকে সরানো হবে।", [{ text: "বাতিল", style: "cancel" }, { text: "মুছুন", style: "destructive", onPress: () => void (async () => { try { await deleteOwnPost(id, user.uid); safeGoBack("/(tabs)"); } catch { setError("পোস্ট মুছতে সমস্যা হয়েছে।"); } })() }]) },
      ] : []),
      { text: "আড়াল করুন", onPress: () => { if (user?.uid && id) void set(ref(pathargataDb, `users/${user.uid}/hidden_posts/${id}`), true).then(async () => { await recordFeedInteraction(user.uid, { uid: post?.uid, title: post?.title, body: post?.description || post?.content || post?.text, type: post?.type }, "hide"); safeGoBack("/(tabs)"); }).catch(() => setError("পোস্ট আড়াল করা যায়নি।")); else safeGoBack("/(tabs)"); } },
      { text: "বন্ধ", style: "cancel" },
    ]);
  }

  async function submitComment() {
    if (!id || !draft.trim()) return;
    const user = pathargataAuth.currentUser;
    if (!user) {
      router.push("/auth");
      return;
    }
    setSending(true);
    setError("");
    try {
      const profile =
        (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
      const authorName = profile.name || user.displayName || "একজন ব্যবহারকারী";
      const comment: Record<string, unknown> = {
        author: authorName,
        authorUid: user.uid,
        authorPic: profile.profile_pic || user.photoURL || null,
        authorRole: profile.role || "user",
        text: draft.trim(),
        time: Date.now(),
      };
      if (replyTarget) {
        comment.parentId = replyTarget.id;
        comment.replyingTo = replyTarget.author || "User";
      }
      await push(ref(pathargataDb, `posts/${id}/comments`), comment);
      await recordFeedInteraction(user.uid, { uid: post?.uid, title: post?.title, body: post?.description || post?.content || post?.text, type: post?.type }, "comment");
      setDraft("");
      setReplyTarget(null);
      if (replyTarget) {
        try {
          const parentSnapshot = await get(
            ref(pathargataDb, `posts/${id}/comments/${replyTarget.id}`),
          );
          const parentComment = parentSnapshot.val() as {
            authorUid?: string;
          } | null;
          if (
            parentComment?.authorUid &&
            parentComment.authorUid !== user.uid
          ) {
            await push(
              ref(pathargataDb, `notifications/${parentComment.authorUid}`),
              {
                type: "reply",
                fromUid: user.uid,
                fromName: authorName,
                fromPhoto: profile.profile_pic || user.photoURL || null,
                postId: id,
                postPreview: String(post?.title || post?.description || post?.content || post?.text || "").slice(0, 140),
                timestamp: Date.now(),
                read: false,
              },
            );
          }
        } catch (notificationError) {
          console.warn(
            "Reply notification failed after comment was saved.",
            notificationError,
          );
        }
      }
    } catch {
      setError("মন্তব্য পাঠানো যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSending(false);
    }
  }

  async function toggleCommentLike(comment: CommentData) {
    const user = pathargataAuth.currentUser;
    if (!user) {
      router.push("/auth");
      return;
    }
    const likeRef = ref(
      pathargataDb,
      `posts/${id}/comments/${comment.id}/likes/${user.uid}`,
    );
    const snapshot = await get(likeRef);
    if (snapshot.exists()) await remove(likeRef);
    else await set(likeRef, true);
  }

  async function submitCommentReport(comment: CommentData) {
    const user = pathargataAuth.currentUser;
    if (!user || !id) return;
    try {
      const profile =
        (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
      await push(ref(pathargataDb, "reported_comments"), {
        reporterUid: user.uid,
        reporterName: profile.name || user.displayName || "Unknown",
        postId: id,
        commentId: comment.id,
        timestamp: Date.now(),
        status: "Pending",
      });
      Alert.alert("ধন্যবাদ", "রিপোর্টটি অ্যাডমিনের কাছে পাঠানো হয়েছে।");
    } catch {
      Alert.alert("সমস্যা", "রিপোর্ট পাঠানো যায়নি। আবার চেষ্টা করুন।");
    }
  }

  function handleCommentAction(action: CommentAction, comment: CommentData) {
    if (action === "copy") {
      void Clipboard.setStringAsync(comment.text)
        .then(() =>
          Alert.alert("কপি হয়েছে", "কমেন্টের লেখা clipboard-এ কপি করা হয়েছে।"),
        )
        .catch(() => Alert.alert("সমস্যা", "কমেন্ট কপি করা যায়নি।"));
      return;
    }

    const user = pathargataAuth.currentUser;
    if (!user) {
      router.push("/auth");
      return;
    }

    if (action === "delete") {
      if (comment.authorUid !== user.uid && post?.uid !== user.uid) {
        Alert.alert("অনুমতি নেই", "শুধু নিজের কমেন্ট অথবা পোস্টের author কমেন্টটি ডিলিট করতে পারবেন।");
        return;
      }
      Alert.alert(
        "কমেন্টটি ডিলিট করবেন?",
        "ডিলিট করলে কমেন্টটি আর ফিরিয়ে আনা যাবে না।",
        [
          { text: "বাতিল", style: "cancel" },
          {
            text: "ডিলিট করুন",
            style: "destructive",
            onPress: () => {
              void remove(
                ref(pathargataDb, `posts/${id}/comments/${comment.id}`),
              ).then(() => setActiveCommentMenu(null)).catch(() => Alert.alert("সমস্যা", "কমেন্ট ডিলিট করা যায়নি।"));
            },
          },
        ],
      );
      return;
    }

    if (comment.authorUid === user.uid) {
      Alert.alert("নিজের কমেন্ট রিপোর্ট করা যাবে না।");
      return;
    }
    Alert.alert(
      "কমেন্ট রিপোর্ট করবেন?",
      "রিপোর্টটি অ্যাডমিনের কাছে পাঠানো হবে।",
      [
        { text: "বাতিল", style: "cancel" },
        {
          text: "রিপোর্ট করুন",
          style: "destructive",
          onPress: () => {
            void submitCommentReport(comment);
          },
        },
      ],
    );
  }

  if (loading)
    return (
      <ScreenContainer className="bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#15803D" />
          <Text className="text-sm text-muted mt-3">পোস্ট লোড হচ্ছে...</Text>
        </View>
      </ScreenContainer>
    );
  if (!post)
    return (
      <ScreenContainer className="bg-background">
        <View className="flex-1 items-center justify-center p-5">
          <Ionicons name="document-text-outline" size={60} color="#CBD5E1" />
          <Text className="text-lg font-bold text-foreground mt-4">
            পোস্ট পাওয়া যায়নি
          </Text>
          <Text className="text-sm text-muted mt-2">
            {error || "পোস্টটি হয়তো মুছে ফেলা হয়েছে।"}
          </Text>
        </View>
      </ScreenContainer>
    );

  const rawPostTitle = post.title || post.text || title || "কমিউনিটি পোস্ট";
  const postTitle = parsePostMediaContent(rawPostTitle).youtubeId ? (post.youtubeTitle || "নিজস্ব ভিডিও") : rawPostTitle;
  const postBody = post.content || post.description || post.text || "";
  const parsedPostBody = parsePostMediaContent(postBody);
  const feelingValue = typeof post.feeling === "string" ? { text: post.feeling, emoji: post.feelingEmoji || "✨" } : post.feeling;
  return (
    <ScreenContainer className="bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View className="px-5 pt-3 pb-4 flex-row items-center border-b border-border">
          <TouchableOpacity
            className="h-10 w-10 rounded-full bg-surface items-center justify-center"
            onPress={() => safeGoBack("/(tabs)")}
          >
            <Ionicons name="arrow-back" size={21} color="#334155" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-foreground ml-3">
            পোস্ট ও মন্তব্য
          </Text>
          <TouchableOpacity className="ml-auto h-10 w-10 items-center justify-center" onPress={showPostActions} accessibilityLabel="পোস্ট অপশন"><Ionicons name="ellipsis-horizontal" size={22} color="#64748B" /></TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View className="rounded-3xl bg-surface border border-border overflow-hidden">
            <View className="p-4 flex-row items-center">
              <View className="h-11 w-11 rounded-full bg-green-100 items-center justify-center overflow-hidden">
                {post.authorPic ? (
                  <Image
                    source={{ uri: post.authorPic }}
                    className="h-full w-full"
                  />
                ) : (
                  <Text className="text-lg font-bold text-primary">
                    {(post.author || "পা").slice(0, 1)}
                  </Text>
                )}
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-bold text-foreground">
                  {post.author || "পাথরঘাটা কমিউনিটি"}
                </Text>
                <Text className="text-xs text-muted mt-1">
                  {timeLabel(post.timestamp)}
                </Text>
              </View>
            </View>
            {feelingValue || post.checkInLocation || post.privacy || post.mobile || post.socialLink ? <View className="px-4 pb-3 flex-row flex-wrap items-center gap-2">{feelingValue ? <View className="flex-row items-center gap-1 rounded-full bg-[#FFF4E7] px-2.5 py-1.5"><Text className="text-sm">{feelingValue.emoji || "✨"}</Text><Text className="text-[12px] font-semibold text-[#805627]">অনুভব করছেন {feelingValue.text}</Text></View> : null}{post.checkInLocation ? <View className="flex-row items-center gap-1 rounded-full bg-[#EDF5F0] px-2.5 py-1.5"><Ionicons name="location-outline" size={14} color="#0A6652" /><Text className="text-[12px] font-semibold text-[#0A6652]">{post.checkInLocation}</Text></View> : null}{post.privacy ? <View className="flex-row items-center gap-1 rounded-full bg-[#F1F5F2] px-2.5 py-1.5"><Ionicons name={post.privacy === "friends" ? "people-outline" : post.privacy === "only_me" ? "lock-closed-outline" : "globe-outline"} size={14} color="#64756B" /><Text className="text-[12px] font-semibold text-[#64756B]">{post.privacy === "friends" ? "Friends" : post.privacy === "only_me" ? "Only Me" : "Public"}</Text></View> : null}{post.mobile ? <TouchableOpacity onPress={() => void Linking.openURL(`tel:${post.mobile}`)} className="flex-row items-center gap-1 rounded-full bg-[#EFF8F1] px-2.5 py-1.5"><Ionicons name="call-outline" size={14} color="#0A8065" /><Text className="text-[12px] font-semibold text-[#0A8065]">কল করুন</Text></TouchableOpacity> : null}{post.socialLink ? <TouchableOpacity onPress={() => void Linking.openURL(post.socialLink || "")} className="flex-row items-center gap-1 rounded-full bg-[#EEF4FF] px-2.5 py-1.5"><Ionicons name="link-outline" size={14} color="#3C72BA" /><Text className="text-[12px] font-semibold text-[#3C72BA]">যোগাযোগের link</Text></TouchableOpacity> : null}</View> : null}
            <View className="px-4 pb-4">
              {editingPost ? <View><TextInput value={editTitle} onChangeText={setEditTitle} placeholder="পোস্টের শিরোনাম" placeholderTextColor="#94A3B8" className="mb-2 rounded-xl border border-border px-3 py-2.5 text-foreground"/><TextInput value={editText} onChangeText={setEditText} multiline textAlignVertical="top" placeholder="পোস্টের লেখা" placeholderTextColor="#94A3B8" className="min-h-24 rounded-xl border border-border p-3 text-foreground"/><View className="flex-row justify-end gap-3 mt-2"><TouchableOpacity onPress={() => setEditingPost(false)}><Text className="text-muted">বাতিল</Text></TouchableOpacity><TouchableOpacity onPress={() => void savePostEdit()}><Text className="font-bold text-primary">সংরক্ষণ</Text></TouchableOpacity></View></View> : <Text className="text-xl font-bold text-foreground mb-2">
                {postTitle}
              </Text>}
              {!editingPost && parsedPostBody.text ? (
                <Text className="text-base leading-6 text-muted">
                  {parsedPostBody.text}
                </Text>
              ) : null}
            </View>
            <PostRichMedia
              images={post.images}
              image={post.image}
              mediaType={post.mediaType}
              type={post.type}
              audio={post.audio}
              videoUrl={post.videoUrl}
              youtubeUrl={post.youtubeUrl}
              youtubeTitle={post.youtubeTitle}
              content={postBody}
              onDoubleTapLike={handleDoubleTapLike}
            />
            {post.type === "poll" && post.options?.length ? <View className="px-4 pb-4 gap-2">
              {post.options.map((option, index) => {
                const total = post.options?.reduce((sum, item) => sum + (Number(item.votes) || 0), 0) || 0;
                const percent = total ? Math.round(((Number(option.votes) || 0) / total) * 100) : 0;
                const voted = pathargataAuth.currentUser?.uid ? post.voters?.[pathargataAuth.currentUser.uid] !== undefined : false;
                return <TouchableOpacity key={`${index}-${option.text}`} disabled={voted} onPress={() => void votePoll(index)} className="rounded-xl border border-border bg-background px-3 py-3"><View className="flex-row items-center justify-between"><Text className="flex-1 text-sm font-semibold text-foreground">{option.text}</Text>{voted ? <Text className="ml-2 text-xs font-bold text-primary">{percent}%</Text> : null}</View>{voted ? <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><View className="h-full bg-primary" style={{ width: `${percent}%` }} /></View> : null}</TouchableOpacity>;
              })}
              <Text className="text-xs text-muted">{Object.keys(post.voters || {}).length}টি ভোট</Text>
            </View> : null}
            <View className="border-t border-border px-4 py-3 flex-row gap-6">
              <TouchableOpacity
                className="flex-row items-center gap-2"
                onPress={handleLike}
              >
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={20}
                  color={liked ? "#DC2626" : "#64748B"}
                />
                <Text className="text-sm text-muted">
                  {likeCount || "লাইক"}
                </Text>
              </TouchableOpacity>
              <View className="flex-row items-center gap-2">
                <Ionicons name="chatbubble-outline" size={20} color="#64748B" />
                <Text className="text-sm text-muted">
                  {comments.length || "মন্তব্য"}
                </Text>
              </View>
            </View>
          </View>
          <View className="flex-row items-center justify-between mt-7 mb-3">
            <Text className="text-lg font-bold text-foreground">
              সব মন্তব্য
            </Text>
            <Text className="text-xs text-muted">{comments.length}টি</Text>
          </View>
          {mainComments.length === 0 ? (
            <View className="items-center py-12">
              <Ionicons name="chatbubbles-outline" size={52} color="#CBD5E1" />
              <Text className="text-sm text-muted mt-3">
                কোনো মন্তব্য নেই, প্রথম মন্তব্য করুন।
              </Text>
            </View>
          ) : (
            mainComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                replies={repliesFor(comment.id)}
                onLike={() => void toggleCommentLike(comment)}
                onReply={() => setReplyTarget(comment)}
                onOpenMenu={setActiveCommentMenu}
                onAction={(action, selectedComment) => handleCommentAction(action, selectedComment)}
              />
            ))
          )}
          {error ? (
            <Text className="text-sm text-error text-center mt-4">{error}</Text>
          ) : null}
        </ScrollView>
        <View className="absolute left-0 right-0 bottom-0 border-t border-border bg-background p-3">
          <View className="flex-row items-end gap-2">
            {replyTarget ? (
              <TouchableOpacity
                className="absolute bottom-14 left-4 right-4 bg-green-50 rounded-xl px-3 py-2"
                onPress={() => setReplyTarget(null)}
              >
                <Text className="text-xs text-primary">
                  {replyTarget.author}-কে reply দিচ্ছেন · বাতিল করুন
                </Text>
              </TouchableOpacity>
            ) : null}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder={
                replyTarget ? "Reply লিখুন..." : "আপনার মন্তব্য লিখুন..."
              }
              placeholderTextColor="#94A3B8"
              className="flex-1 max-h-24 rounded-3xl bg-surface border border-border px-4 py-3 text-sm text-foreground"
            />
            <TouchableOpacity
              className="h-11 w-11 rounded-full bg-primary items-center justify-center"
              onPress={submitComment}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons name="send" size={19} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Modal
          visible={Boolean(activeCommentMenu)}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setActiveCommentMenu(null)}
        >
          <View className="flex-1 justify-end bg-black/45">
            <TouchableOpacity className="flex-1" activeOpacity={1} onPress={() => setActiveCommentMenu(null)} />
            <View
              accessibilityViewIsModal
              className="rounded-t-[30px] border-t border-border bg-background px-4 pb-8 pt-3"
            >
              <View className="mb-4 items-center"><View className="h-1 w-12 rounded-full bg-border" /></View>
              <View className="mb-3 flex-row items-center rounded-2xl border border-border bg-surface px-3 py-3">
                <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-green-100">
                  {activeCommentMenu?.authorPic ? <Image source={{ uri: activeCommentMenu.authorPic }} className="h-full w-full" /> : <Text className="font-bold text-primary">{(activeCommentMenu?.author || "U").slice(0, 1)}</Text>}
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-base font-extrabold text-foreground">কমেন্টের অপশন</Text>
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>{activeCommentMenu?.author || "User"}</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveCommentMenu(null)} className="h-9 w-9 items-center justify-center rounded-full bg-background" accessibilityRole="button" accessibilityLabel="কমেন্ট অপশন বন্ধ করুন">
                  <Ionicons name="close" size={19} color="#64748B" />
                </TouchableOpacity>
              </View>
              <View className="mb-3 rounded-2xl border border-border bg-surface px-3 py-2">
                <Text className="text-xs leading-5 text-muted" numberOfLines={3}>{activeCommentMenu?.text}</Text>
              </View>
              {activeCommentMenu ? <CommentMenuRow icon="copy-outline" title="কমেন্ট কপি করুন" subtitle="লেখাটি clipboard-এ সংরক্ষণ করুন" onPress={() => { const comment = activeCommentMenu; setActiveCommentMenu(null); handleCommentAction("copy", comment); }} /> : null}
              {activeCommentMenu && (activeCommentMenu.authorUid === pathargataAuth.currentUser?.uid || post.uid === pathargataAuth.currentUser?.uid) ? <CommentMenuRow icon="trash-outline" title="কমেন্ট ডিলিট করুন" subtitle={activeCommentMenu.authorUid === pathargataAuth.currentUser?.uid ? "আপনার নিজের কমেন্ট" : "আপনার পোস্টের কমেন্ট"} danger onPress={() => { const comment = activeCommentMenu; setActiveCommentMenu(null); handleCommentAction("delete", comment); }} /> : null}
              {activeCommentMenu && activeCommentMenu.authorUid !== pathargataAuth.currentUser?.uid ? <CommentMenuRow icon="flag-outline" title="কমেন্ট রিপোর্ট করুন" subtitle="Moderation team-কে জানান" danger onPress={() => { const comment = activeCommentMenu; setActiveCommentMenu(null); handleCommentAction("report", comment); }} /> : null}
              <TouchableOpacity onPress={() => setActiveCommentMenu(null)} className="mt-2 items-center rounded-2xl bg-background py-3"><Text className="font-bold text-muted">বাতিল</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function CommentMenuRow({ icon, title, subtitle, danger = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; danger?: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={title} className="mb-1 flex-row items-center gap-3 rounded-2xl border border-transparent px-2 py-3 active:bg-surface"><View className={`h-10 w-10 items-center justify-center rounded-xl ${danger ? "bg-red-50" : "bg-surface"}`}><Ionicons name={icon} size={19} color={danger ? "#B91C1C" : "#0A6652"} /></View><View className="flex-1"><Text className={`text-[15px] font-bold ${danger ? "text-red-700" : "text-foreground"}`}>{title}</Text><Text className="mt-0.5 text-xs text-muted">{subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color="#A1AAA3" /></TouchableOpacity>;
}

function CommentCard({
  comment,
  replies,
  onLike,
  onReply,
  onOpenMenu,
  onAction,
}: {
  comment: CommentData;
  replies: CommentData[];
  onLike: () => void;
  onReply: () => void;
  onOpenMenu: (comment: CommentData) => void;
  onAction: (action: CommentAction, comment: CommentData) => void;
}) {
  const uid = pathargataAuth.currentUser?.uid;
  const liked = Boolean(uid && comment.likes?.[uid]);

  function openActions() {
    void Haptics.selectionAsync();
    onOpenMenu(comment);
  }

  return (
    <View className="mb-4">
      <View className="flex-row gap-3">
        <View className="h-9 w-9 rounded-full bg-green-100 items-center justify-center overflow-hidden">
          {comment.authorPic ? (
            <Image
              source={{ uri: comment.authorPic }}
              className="h-full w-full"
            />
          ) : (
            <Text className="text-sm font-bold text-primary">
              {(comment.author || "U").slice(0, 1)}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <View className="rounded-2xl rounded-tl-md bg-surface border border-border px-3 py-2.5">
            <Text className="text-xs font-bold text-foreground">
              {comment.author || "User"}
            </Text>
            <Text className="text-sm leading-5 text-foreground mt-1">
              {comment.replyingTo ? (
                <Text className="text-primary">@{comment.replyingTo} </Text>
              ) : null}
              {comment.text}
            </Text>
          </View>
          <View className="flex-row items-center gap-4 px-2 pt-2">
            <TouchableOpacity onPress={onLike}>
              <Text
                className={`text-xs font-bold ${liked ? "text-red-600" : "text-muted"}`}
              >
                {liked ? "লাইক হয়েছে" : "লাইক"}{" "}
                {comment.likes ? `· ${Object.keys(comment.likes).length}` : ""}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onReply}>
              <Text className="text-xs font-bold text-muted">রিপ্লাই</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="ml-auto h-8 w-8 items-center justify-center"
              onPress={openActions}
              accessibilityRole="button"
              accessibilityLabel="কমেন্ট অপশন"
            >
              <Ionicons name="ellipsis-horizontal" size={19} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {replies.length > 0 ? (
        <View className="ml-12 mt-2 border-l-2 border-border pl-3">
          {replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              replies={[]}
              onLike={onLike}
              onReply={onReply}
              onOpenMenu={onOpenMenu}
              onAction={onAction}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
