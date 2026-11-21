import { useFocusEffect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { getFreshWithCache, getWithCache } from "@/lib/rtdb-cache";
import { endBefore, limitToLast, onValue, orderByChild, query, ref } from "firebase/database";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { parsePostMediaContent } from "@/lib/post-media";
import { filterEligibleFeedPosts, rankCommunityPosts } from "@/lib/feed-ranking";
import { clearFeedPreferences, EMPTY_FEED_PREFERENCES, loadFeedPreferences, subscribeFeedPreferences, type FeedPreferences } from "@/lib/feed-preferences";

export type FeedFilter = "for-you" | "all" | "union" | "village";
export type FeedCommentPreview = {
  id: string;
  author: string;
  authorUid?: string;
  authorPic?: string | null;
  text: string;
};
export type CommunityPost = {
  id: string;
  uid?: string;
  name: string;
  authorPic?: string;
  authorVerified?: boolean;
  time: string;
  title: string;
  body: string;
  color: string;
  images: string[];
  mediaType?: string;
  type?: string;
  repostMessage?: string;
  originalPostId?: string;
  originalPostAuthorUid?: string;
  originalPostAuthor?: string;
  originalPostAuthorPic?: string;
  originalPostTitle?: string;
  originalPostBody?: string;
  originalPostImages?: string[];
  originalPostAudio?: string;
  originalPostType?: string;
  originalPostMediaType?: string;
  originalPostFeeling?: string;
  originalPostCheckInLocation?: string;
  audio?: string;
  feeling?: string;
  feelingEmoji?: string;
  checkInLocation?: string;
  bgColor?: string;
  mobile?: string;
  socialLink?: string;
  youtubeUrl?: string;
  youtubeTitle?: string;
  options?: { text: string; votes?: number }[];
  voters?: Record<string, number>;
  union?: string;
  village?: string;
  privacy?: string;
  authorRole?: string;
  adminScore?: number | string;
  expiresAt?: number;
  repostCount?: number;
  timestamp?: number;
  likeCount: number;
  commentCount: number;
  commentPreviews?: FeedCommentPreview[];
  isLiked: boolean;
};
const PAGE_SIZE = 15;
const CANDIDATE_SIZE = 45;
const MAX_FEED_POSTS = 150;
const MIN_FEED_REFRESH_INTERVAL_MS = 30 * 1000;
const fallbackPosts: CommunityPost[] = [];
function relativeTime(timestamp?: number) {
  if (!timestamp) return "সাম্প্রতিক";
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes} মিনিট আগে`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  return `${Math.floor(hours / 24)} দিন আগে`;
}
export function normalizeCommunityPost(
  id: string,
  value: Record<string, unknown>,
): CommunityPost {
  const timestamp = Number(value.timestamp) || 0;
  const rawImages = value.images ?? (value.image ? [value.image] : []);
  const images = Array.isArray(rawImages)
    ? rawImages.filter(
        (image): image is string =>
          typeof image === "string" && image.length > 0,
      )
    : Object.values(rawImages as Record<string, unknown>).filter(
        (image): image is string =>
          typeof image === "string" && image.length > 0,
      );
  const originalRawImages = value.originalPostImages ?? [];
  const originalPostImages = Array.isArray(originalRawImages)
    ? originalRawImages.filter((image): image is string => typeof image === "string" && image.length > 0)
    : Object.values(originalRawImages as Record<string, unknown>).filter((image): image is string => typeof image === "string" && image.length > 0);
  const isRepost = value.type === "repost";
  const repostMessage = typeof value.repostMessage === "string" ? value.repostMessage : (isRepost && typeof value.content === "string" && !value.content.startsWith("[রিপোস্ট]") ? value.content : "");
  const rawContent = isRepost ? repostMessage : String(value.description || value.content || value.text || "");
  const parsedMedia = parsePostMediaContent(rawContent);
  const youtubeUrl = typeof value.youtubeUrl === "string" && value.youtubeUrl.trim() ? value.youtubeUrl : parsedMedia.youtubeId ? (rawContent.match(/(?:https?:\/\/)?(?:(?:www\.|m\.)?youtube\.com|youtu\.be)[^\s]+/i)?.[0] || undefined) : undefined;
  const youtubeTitle = typeof value.youtubeTitle === "string" ? value.youtubeTitle : undefined;
  const isYoutubePost = Boolean(youtubeUrl || parsedMedia.youtubeId);
  const rawFeeling = value.feeling;
  const feelingObject = rawFeeling && typeof rawFeeling === "object" ? rawFeeling as Record<string, unknown> : null;
  const feeling = typeof rawFeeling === "string" ? rawFeeling : typeof feelingObject?.text === "string" ? feelingObject.text : undefined;
  const feelingEmoji = typeof feelingObject?.emoji === "string" ? feelingObject.emoji : undefined;
  return {
    id,
    uid: typeof value.uid === "string" ? value.uid : undefined,
    name: String(
      value.author || value.userName || value.name || "পাথরঘাটা কমিউনিটি",
    ),
    authorPic: typeof value.authorPic === "string" ? value.authorPic : undefined,
    authorVerified: Boolean(value.authorVerified),
    time: relativeTime(timestamp),
    title: isRepost ? repostMessage : (isYoutubePost ? (youtubeTitle || "") : String(value.title || value.text || "কমিউনিটি আপডেট")),
    body: isRepost ? repostMessage : (isYoutubePost ? (parsedMedia.text || rawContent || "") : rawContent || "আরও বিস্তারিত জানতে পোস্টটি খুলুন."),
    color: value.type === "blood" ? "#FEE2E2" : "#DCFCE7",
    images,
    mediaType:
      typeof value.mediaType === "string" ? value.mediaType : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
    repostMessage,
    originalPostId: typeof value.originalPostId === "string" ? value.originalPostId : undefined,
    originalPostAuthorUid: typeof value.originalPostAuthorUid === "string" ? value.originalPostAuthorUid : undefined,
    originalPostAuthor: typeof value.originalPostAuthor === "string" ? value.originalPostAuthor : undefined,
    originalPostAuthorPic: typeof value.originalPostAuthorPic === "string" ? value.originalPostAuthorPic : undefined,
    originalPostTitle: typeof value.originalPostTitle === "string" ? value.originalPostTitle : undefined,
    originalPostBody: typeof value.originalPostBody === "string" ? value.originalPostBody : undefined,
    originalPostImages,
    originalPostAudio: typeof value.originalPostAudio === "string" ? value.originalPostAudio : undefined,
    originalPostType: typeof value.originalPostType === "string" ? value.originalPostType : undefined,
    originalPostMediaType: typeof value.originalPostMediaType === "string" ? value.originalPostMediaType : undefined,
    originalPostFeeling: typeof value.originalPostFeeling === "string" ? value.originalPostFeeling : undefined,
    originalPostCheckInLocation: typeof value.originalPostCheckInLocation === "string" ? value.originalPostCheckInLocation : undefined,
    audio: typeof value.audio === "string" ? value.audio : undefined,
    feeling,
    feelingEmoji,
    checkInLocation: typeof value.checkInLocation === "string" ? value.checkInLocation : undefined,
    bgColor: typeof value.bgColor === "string" ? value.bgColor : undefined,
    mobile: typeof value.mobile === "string" ? value.mobile : undefined,
    socialLink: typeof value.socialLink === "string" ? value.socialLink : undefined,
    youtubeUrl,
    youtubeTitle,
    options: Array.isArray(value.options) ? value.options as { text: string; votes?: number }[] : undefined,
    // Interaction details live under posts/{id} and are loaded on the detail
    // screen. public_posts contains only scalar counters and small previews.
    voters: undefined,
    union: typeof value.union === "string" ? value.union : undefined,
    village: typeof value.village === "string" ? value.village : undefined,
    privacy: typeof value.privacy === "string" ? value.privacy : undefined,
    authorRole:
      typeof value.authorRole === "string" ? value.authorRole : undefined,
    adminScore:
      typeof value.adminScore === "number" ||
      typeof value.adminScore === "string"
        ? value.adminScore
        : undefined,
    timestamp,
    likeCount: Math.max(0, Number(value.likeCount) || 0),
    commentCount: Math.max(0, Number(value.commentCount) || 0),
    repostCount: Number(value.repostCount) || 0,
    expiresAt: Number(value.expiresAt) || undefined,
    commentPreviews: Array.isArray(value.commentPreviews)
      ? value.commentPreviews as FeedCommentPreview[]
      : undefined,
    // Keep liker UIDs out of the public projection; feed cards subscribe only
    // to the signed-in user's like record for each mounted post.
    isLiked: false,
  };
}
function sortNewest(posts: CommunityPost[]) {
  return [...posts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}
const FEED_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

export function useCommunityFeed(filter: FeedFilter = "for-you") {
  const [authUid, setAuthUid] = useState<string | null>(pathargataAuth.currentUser?.uid ?? null);
  const authUidRef = useRef(authUid);
  const [posts, setPosts] = useState<CommunityPost[]>(fallbackPosts);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [source, setSource] = useState<"cache" | "live" | "fallback">(
    "fallback",
  );
  const lastRefreshAt = useRef(0);
  const [profile, setProfile] = useState<{
    uid?: string;
    union?: string;
    village?: string;
    friends: string[];
    hiddenPosts: string[];
    savedPosts: string[];
  }>({ friends: [], hiddenPosts: [], savedPosts: [] });
  const [deactivatedAuthorIds, setDeactivatedAuthorIds] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<FeedPreferences>(EMPTY_FEED_PREFERENCES);
  const [rankingPreferences, setRankingPreferences] = useState<FeedPreferences>(EMPTY_FEED_PREFERENCES);
  const preferencesRef = useRef(preferences);
  const postsRef = useRef(posts);
  useEffect(() => {
    preferencesRef.current = preferences;
    postsRef.current = posts;
  }, [preferences, posts]);
  const [refreshKey, setRefreshKey] = useState(0);
  const appOpenedAt = useRef<number | null>(null);
  const fallback = useMemo(() => fallbackPosts, []);
  useEffect(() => onAuthStateChanged(pathargataAuth, (user) => {
    const nextUid = user?.uid ?? null;
    const previousUid = authUidRef.current;
    authUidRef.current = nextUid;
    setAuthUid(nextUid);
    if (previousUid === nextUid) return;
    setPosts([]);
    setProfile({ friends: [], hiddenPosts: [], savedPosts: [] });
    setPreferences(EMPTY_FEED_PREFERENCES);
    setRankingPreferences(EMPTY_FEED_PREFERENCES);
    setDeactivatedAuthorIds([]);
    setNewPostCount(0);
    setHasMore(Boolean(nextUid));
    setSource("fallback");
    setLoading(Boolean(nextUid));
    setRefreshing(false);
    setLoadingMore(false);
  }), []);

  useFocusEffect(
    useCallback(
      () => {
        let active = true;
        void getFreshWithCache<Record<string, unknown>>(ref(pathargataDb, "deactivated_users"), FEED_CACHE_MAX_AGE_MS).then(({ value }) => {
          if (active) setDeactivatedAuthorIds(Object.keys(value || {}));
        }).catch(() => {
          if (active) setDeactivatedAuthorIds([]);
        });
        return () => { active = false; };
      },
      [],
    ),
  );

  useFocusEffect(
    useCallback(() => {
      const uid = authUid;
      if (!uid) { setProfile({ friends: [], hiddenPosts: [], savedPosts: [] }); setPreferences(EMPTY_FEED_PREFERENCES); setRankingPreferences(EMPTY_FEED_PREFERENCES); return; }
      let active = true;
      const unsubscribePreferences = subscribeFeedPreferences(uid, setPreferences);
      const unsubscribeSavedPosts = onValue(ref(pathargataDb, `users/${uid}/saved_posts`), (snapshot) => {
        if (!active) return;
        const savedPosts = Object.entries((snapshot.val() || {}) as Record<string, unknown>)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([postId]) => postId);
        setProfile((current) => current.uid === uid
          ? { ...current, savedPosts }
          : { uid, friends: [], hiddenPosts: [], savedPosts });
      }, () => undefined);
      void loadFeedPreferences(uid).then((value) => { if (active) { setPreferences(value); setRankingPreferences(value); } });
      void getFreshWithCache<Record<string, unknown>>(ref(pathargataDb, `users/${uid}`), FEED_CACHE_MAX_AGE_MS).then(({ value }) => {
        if (!active) return;
        const profileValue = value || {};
        const rawFriends = profileValue.friends;
        const friends =
          rawFriends && typeof rawFriends === "object"
            ? Object.entries(rawFriends as Record<string, unknown>)
                .filter(([, enabled]) => Boolean(enabled))
                .map(([friendUid]) => friendUid)
            : [];
        const hiddenPosts = profileValue.hidden_posts && typeof profileValue.hidden_posts === "object" ? Object.keys(profileValue.hidden_posts as Record<string, unknown>) : [];
        const saved = { ...((profileValue.saved_posts || {}) as Record<string, unknown>), ...((profileValue.saved || {}) as Record<string, unknown>) };
        const savedPosts = Object.keys(saved).filter((postId) => Boolean(saved[postId]));
        setProfile((current) => ({
          uid,
          union: typeof profileValue.union === "string" ? profileValue.union : undefined,
          village: typeof profileValue.village === "string" ? profileValue.village : undefined,
          friends,
          hiddenPosts,
          savedPosts: current.uid === uid ? current.savedPosts : savedPosts,
        }));
      }).catch(() => undefined);
      return () => { active = false; unsubscribePreferences(); unsubscribeSavedPosts(); };
    }, [authUid]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (appOpenedAt.current === null) appOpenedAt.current = Date.now();
      const appOpenedAtMs = appOpenedAt.current;
      const feedQuery = query(ref(pathargataDb, "public_posts"), orderByChild("timestamp"), limitToLast(CANDIDATE_SIZE + 1));
      const read = refreshKey === 0 ? getFreshWithCache<Record<string, Record<string, unknown>>>(feedQuery, FEED_CACHE_MAX_AGE_MS) : getWithCache<Record<string, Record<string, unknown>>>(feedQuery);
      void read.then(({ value: raw, source: readSource }) => {
        if (!active) return;
        const rawEntries = Object.entries(raw || {});
        const allLivePosts = sortNewest(rawEntries.map(([id, value]) => normalizeCommunityPost(id, value)));
        const livePosts = allLivePosts.slice(0, CANDIDATE_SIZE);
        if (refreshKey > 0 && authUid) {
          const previousIds = new Set(postsRef.current.map((post) => post.id));
          const incomingCount = livePosts.filter((post) => !previousIds.has(post.id) && Number(post.timestamp) >= appOpenedAtMs && post.uid !== authUid).length;
          if (incomingCount) setNewPostCount((count) => count + incomingCount);
        }
        setPosts(livePosts.length ? livePosts : fallback);
        setRankingPreferences(preferencesRef.current);
        setHasMore(rawEntries.length > CANDIDATE_SIZE);
        setSource(livePosts.length ? (readSource === "cache" ? "cache" : "live") : "fallback");
        setLoading(false);
        setRefreshing(false);
      }).catch(() => {
        if (!active) return;
        setPosts(fallback);
        setSource("fallback");
        setLoading(false);
        setRefreshing(false);
      });
      return () => { active = false; };
    }, [authUid, fallback, refreshKey]),
  );

  const filteredPosts = useMemo(() => {
    let relevantPosts = posts.filter((post) => !profile.hiddenPosts.includes(post.id));
    if (filter === "union" || filter === "village") {
      const value = filter === "union" ? profile.union : profile.village;
      if (!value) return [];
      relevantPosts = relevantPosts.filter((post) =>
        filter === "union" ? post.union === value : post.village === value,
      );
    }
    const friendIds = new Set(profile.friends);
    relevantPosts = filterEligibleFeedPosts(relevantPosts, {
      uid: profile.uid,
      hiddenPostIds: new Set(profile.hiddenPosts),
      savedPostIds: new Set(profile.savedPosts),
      deactivatedAuthorIds: new Set(deactivatedAuthorIds),
      preferences: rankingPreferences,
      union: profile.union,
      village: profile.village,
    }, friendIds);
    if (filter === "all") return sortNewest(relevantPosts);
    return rankCommunityPosts(relevantPosts, {
      uid: profile.uid,
      hiddenPostIds: new Set(profile.hiddenPosts),
      savedPostIds: new Set(profile.savedPosts),
      deactivatedAuthorIds: new Set(deactivatedAuthorIds),
      preferences: rankingPreferences,
      union: profile.union,
      village: profile.village,
    }, friendIds);
  }, [deactivatedAuthorIds, filter, posts, profile, rankingPreferences]);

  const hidePost = useCallback((postId: string) => {
    setProfile((current) => current.hiddenPosts.includes(postId)
      ? current
      : { ...current, hiddenPosts: [...current.hiddenPosts, postId] });
  }, []);

  async function loadMore() {
    if (loadingMore || !hasMore || posts.length === 0) return;
    // `posts` is maintained newest-first, so the last item is the cursor.
    // Avoid sorting the complete in-memory feed on every pagination request.
    const oldest = posts[posts.length - 1];
    if (!oldest?.timestamp) {
      setHasMore(false);
      return;
    }
    const oldestTimestamp = oldest.timestamp;
    setLoadingMore(true);
    try {
      const { value: raw } = await getWithCache<
        Record<string, Record<string, unknown>>
      >(query(ref(pathargataDb, "public_posts"), orderByChild("timestamp"), endBefore(oldestTimestamp, oldest.id), limitToLast(PAGE_SIZE + 1)));
      const olderPosts = raw
        ? sortNewest(
            Object.entries(raw).map(([id, value]) => normalizeCommunityPost(id, value)),
          )
            .filter((post) => (post.timestamp || 0) < oldestTimestamp)
            .slice(0, PAGE_SIZE)
        : [];
      setPosts((current) => {
        const currentIds = new Set(current.map((post) => post.id));
        const uniqueOlderPosts = olderPosts.filter(
          (post) => !currentIds.has(post.id),
        );

        // Both arrays are newest-first and `olderPosts` is strictly older
        // than the current cursor, so concatenation preserves sort order.
        return [...current, ...uniqueOlderPosts].slice(0, MAX_FEED_POSTS);
      });
      setRankingPreferences(preferencesRef.current);
      if (olderPosts.length < PAGE_SIZE) setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  const refresh = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshAt.current < MIN_FEED_REFRESH_INTERVAL_MS) return;
    lastRefreshAt.current = now;
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  }, []);
  function clearNewPostAlert() {
    setNewPostCount(0);
  }
  async function resetPreferences() {
    const uid = pathargataAuth.currentUser?.uid;
    if (uid) await clearFeedPreferences(uid);
  }
  return {
    posts: filteredPosts,
    savedPostIds: profile.savedPosts,
    hidePost,
    loading,
    refreshing,
    loadingMore,
    newPostCount,
    clearNewPostAlert,
    resetPreferences,
    hasMore,
    source,
    refresh,
    loadMore,
  };
}
