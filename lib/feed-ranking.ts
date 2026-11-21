import type { FeedPreferences } from "./feed-preferences";

export type RankablePost = {
  id: string;
  uid?: string;
  timestamp?: number;
  expiresAt?: number;
  likeCount: number;
  commentCount: number;
  repostCount?: number;
  village?: string;
  union?: string;
  authorRole?: string;
  authorVerified?: boolean;
  adminScore?: number | string;
  privacy?: string;
  type?: string;
  title?: string;
  body?: string;
  feeling?: string;
  originalPostTitle?: string;
  originalPostBody?: string;
  originalPostType?: string;
};

export type FeedRankingProfile = {
  village?: string;
  union?: string;
  uid?: string;
  hiddenPostIds?: ReadonlySet<string>;
  savedPostIds?: ReadonlySet<string>;
  deactivatedAuthorIds?: ReadonlySet<string>;
  preferences?: FeedPreferences;
};

type ScoredPost<T> = { post: T; score: number; diversityKey: string };
const STOP_WORDS = new Set(["আমি", "আমার", "আমরা", "আপনি", "আপনার", "তুমি", "এবং", "অথবা", "কিন্তু", "জন্য", "থেকে", "সাথে", "করে", "করুন", "করতে", "হবে", "হয়েছে", "হচ্ছে", "একটি", "একজন", "এই", "সেই", "এটা", "ওটা", "আজ", "এখন", "খুব", "আরও", "নিয়ে", "কিছু", "সব", "তথ্য", "পোস্ট", "কমিউনিটি", "the", "and", "for", "with", "from", "this", "that", "you", "your", "have", "has", "was", "are", "our", "not", "but", "all"]);

function topicTokens(post: RankablePost) {
  const isRepost = post.type === "repost";
  return [...new Set([post.title, post.body, post.feeling, isRepost ? post.originalPostTitle : undefined, isRepost ? post.originalPostBody : undefined].filter(Boolean).join(" ").toLocaleLowerCase().split(/\s+/u)
    .map((word) => word.replace(/^[^A-Za-z0-9\u0980-\u09FF]+|[^A-Za-z0-9\u0980-\u09FF]+$/g, ""))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word)))].slice(0, 12);
}
function bounded(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function scorePost<T extends RankablePost>(post: T, profile: FeedRankingProfile, friendIds: ReadonlySet<string>, now: number) {
  const timestamp = Number(post.timestamp) || 0;
  const hoursAge = Math.max(0, (now - timestamp) / 3_600_000);
  const likes = Math.max(0, Number(post.likeCount) || 0);
  const comments = Math.max(0, Number(post.commentCount) || 0);
  const shares = Math.max(0, Number(post.repostCount) || 0);

  // Smooth 48-hour freshness half-life plus logarithmic engagement to limit viral/brigading dominance.
  let points = 78 * Math.exp(-hoursAge / 48);
  points += Math.log1p(likes) * 7 + Math.log1p(comments) * 12 + Math.log1p(shares) * 8;
  if (post.uid && friendIds.has(post.uid)) points += 20;
  if (profile.village && post.village === profile.village) points += 18;
  else if (profile.union && post.union === profile.union) points += 11;

  const role = (post.authorRole || "").toLocaleLowerCase();
  if (role === "admin") points += 15;
  else if (role === "journalist") points += 11;
  if (post.authorVerified) points += 7;
  const trustedAdminScore = Number.parseInt(String(post.adminScore ?? 0), 10);
  if (Number.isFinite(trustedAdminScore)) points += bounded(trustedAdminScore, 0, 18);

  const preferences = profile.preferences;
  if (preferences) {
    const topicScore = topicTokens(post).reduce((sum, topic) => sum + bounded(preferences.topics[topic] || 0, -5, 8), 0);
    points += bounded(topicScore * 2.2, -20, 30);
    if (post.uid) points += bounded(preferences.authors[post.uid] || 0, -4, 8) * 2.5;
    const postType = (post.type === "repost" ? post.originalPostType || "repost" : post.type)?.trim().toLocaleLowerCase();
    if (postType) points += bounded(preferences.types[postType] || 0, -5, 8) * 2;
  }
  if (profile.savedPostIds?.has(post.id)) points += 12;
  return points;
}

/** Apply access/expiry/hidden-post eligibility before ranking. RTDB security rules remain the authorization boundary. */
export function filterEligibleFeedPosts<T extends RankablePost>(
  posts: readonly T[],
  profile: FeedRankingProfile,
  friendIds: ReadonlySet<string>,
  now = Date.now(),
): T[] {
  return posts.filter((post) => {
    if (profile.hiddenPostIds?.has(post.id)) return false;
    if (post.uid && profile.deactivatedAuthorIds?.has(post.uid)) return false;
    if (Number(post.expiresAt) > 0 && Number(post.expiresAt) <= now) return false;
    const privacy = (post.privacy || "public").toLocaleLowerCase();
    const ownPost = Boolean(profile.uid && post.uid === profile.uid);
    if (["only_me", "only-me", "private"].includes(privacy)) return ownPost;
    if (["friends", "friends_only", "friends-only"].includes(privacy)) return ownPost || Boolean(post.uid && friendIds.has(post.uid));
    return true;
  });
}

/** Rank a broad candidate window using explainable engagement, freshness, locality, social and on-device preference signals. */
export function rankCommunityPosts<T extends RankablePost>(
  posts: readonly T[],
  profile: FeedRankingProfile,
  friendIds: ReadonlySet<string>,
  now = Date.now(),
): T[] {
  const remaining: ScoredPost<T>[] = posts.map((post) => ({
    post,
    score: scorePost(post, profile, friendIds, now),
    diversityKey: (post.type === "repost" ? post.originalPostType : post.type)?.toLocaleLowerCase() || topicTokens(post)[0] || "general",
  }));
  const compare = (a: ScoredPost<T>, b: ScoredPost<T>) =>
    b.score - a.score ||
    (Number(b.post.timestamp) || 0) - (Number(a.post.timestamp) || 0) ||
    a.post.id.localeCompare(b.post.id);
  const output: T[] = [];
  const authorCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();

  while (remaining.length) {
    remaining.sort((a, b) => {
      const authorA = a.post.uid || `unknown:${a.post.id}`;
      const authorB = b.post.uid || `unknown:${b.post.id}`;
      const adjustedA = a.score * Math.pow(0.62, authorCounts.get(authorA) || 0) * Math.pow(0.84, topicCounts.get(a.diversityKey) || 0);
      const adjustedB = b.score * Math.pow(0.62, authorCounts.get(authorB) || 0) * Math.pow(0.84, topicCounts.get(b.diversityKey) || 0);
      return adjustedB - adjustedA || compare(a, b);
    });
    const next = remaining.shift()!;
    output.push(next.post);
    const author = next.post.uid || `unknown:${next.post.id}`;
    authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    topicCounts.set(next.diversityKey, (topicCounts.get(next.diversityKey) || 0) + 1);
  }
  return output;
}
