import AsyncStorage from "@react-native-async-storage/async-storage";

export type FeedInteraction = "open" | "like" | "unlike" | "comment" | "vote" | "save" | "unsave" | "repost" | "hide" | "report";
export type FeedPreferencePost = {
  uid?: string;
  title?: string;
  body?: string;
  type?: string;
  feeling?: string;
  originalPostTitle?: string;
  originalPostBody?: string;
  originalPostType?: string;
};
export type FeedPreferences = {
  version: 1;
  updatedAt: number;
  topics: Record<string, number>;
  authors: Record<string, number>;
  types: Record<string, number>;
};

export const EMPTY_FEED_PREFERENCES: FeedPreferences = { version: 1, updatedAt: 0, topics: {}, authors: {}, types: {} };
const KEY_PREFIX = "pathargata-feed-preferences-v1:";
const MAX_TOPICS = 80;
const MAX_AUTHORS = 100;
const MAX_TYPES = 24;
const STOP_WORDS = new Set([
  "আমি", "আমার", "আমরা", "আপনি", "আপনার", "তুমি", "এবং", "অথবা", "কিন্তু", "জন্য", "থেকে", "সাথে", "করে", "করুন", "করতে", "হবে", "হয়েছে", "হচ্ছে", "একটি", "একজন", "এই", "সেই", "এটা", "ওটা", "আজ", "এখন", "খুব", "আরও", "নিয়ে", "কিছু", "সব", "তথ্য", "পোস্ট", "কমিউনিটি", "the", "and", "for", "with", "from", "this", "that", "you", "your", "have", "has", "was", "are", "our", "not", "but", "all",
]);
const ACTION_WEIGHT: Record<FeedInteraction, number> = { open: 0.25, like: 1.5, unlike: -1.5, comment: 2, vote: 1, save: 3, unsave: -2, repost: 1.5, hide: -3, report: -4 };

function boundedMap(input: Record<string, number>, limit: number) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => Number.isFinite(value) && Math.abs(value) >= 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, limit));
}
function normalize(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === "number" && Number.isFinite(v))) as Record<string, number>;
}
function normalizePreferences(value: unknown): FeedPreferences {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    version: 1,
    updatedAt: Number(data.updatedAt) || 0,
    topics: normalize(data.topics),
    authors: normalize(data.authors),
    types: normalize(data.types),
  };
}
function decayPreferences(value: FeedPreferences, now: number): FeedPreferences {
  if (!value.updatedAt || now <= value.updatedAt) return value;
  const elapsedDays = (now - value.updatedAt) / 86_400_000;
  const factor = Math.pow(0.5, elapsedDays / 45);
  const decay = (map: Record<string, number>) => Object.fromEntries(Object.entries(map).map(([key, score]) => [key, score * factor]));
  return { ...value, topics: decay(value.topics), authors: decay(value.authors), types: decay(value.types) };
}

export function extractFeedTopics(post: FeedPreferencePost): string[] {
  const isRepost = post.type === "repost";
  const words = [post.title, post.body, post.feeling, isRepost ? post.originalPostTitle : undefined, isRepost ? post.originalPostBody : undefined].filter(Boolean).join(" ").toLocaleLowerCase().split(/\s+/u);
  return [...new Set(words.map((word) => word.replace(/^[^A-Za-z0-9\u0980-\u09FF]+|[^A-Za-z0-9\u0980-\u09FF]+$/g, "")).filter((word) => word.length > 1 && !STOP_WORDS.has(word)))].slice(0, 12);
}

export function applyFeedInteraction(existing: unknown, post: FeedPreferencePost, action: FeedInteraction, now = Date.now()): FeedPreferences {
  const old = decayPreferences(normalizePreferences(existing), now);
  const weight = ACTION_WEIGHT[action];
  const add = (source: Record<string, number>, key: string, cap: number) => {
    if (!key) return source;
    return { ...source, [key]: Math.max(-cap, Math.min(cap, (source[key] || 0) + weight)) };
  };
  let topics = old.topics;
  for (const topic of extractFeedTopics(post)) topics = add(topics, topic, 18);
  const authors = post.uid ? add(old.authors, post.uid, 12) : old.authors;
  const type = (post.type === "repost" ? post.originalPostType || "repost" : post.type)?.trim().toLocaleLowerCase();
  const types = type ? add(old.types, type, 12) : old.types;
  return { version: 1, updatedAt: now, topics: boundedMap(topics, MAX_TOPICS), authors: boundedMap(authors, MAX_AUTHORS), types: boundedMap(types, MAX_TYPES) };
}

function storageKey(uid: string) { return `${KEY_PREFIX}${uid}`; }
const subscribers = new Map<string, Set<(preferences: FeedPreferences) => void>>();
function publish(uid: string, preferences: FeedPreferences) { subscribers.get(uid)?.forEach((listener) => listener(preferences)); }

export async function loadFeedPreferences(uid: string): Promise<FeedPreferences> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    return raw ? decayPreferences(normalizePreferences(JSON.parse(raw)), Date.now()) : EMPTY_FEED_PREFERENCES;
  } catch { return EMPTY_FEED_PREFERENCES; }
}

export function subscribeFeedPreferences(uid: string, listener: (preferences: FeedPreferences) => void) {
  const set = subscribers.get(uid) || new Set<(preferences: FeedPreferences) => void>();
  set.add(listener);
  subscribers.set(uid, set);
  return () => { set.delete(listener); if (!set.size) subscribers.delete(uid); };
}

export async function recordFeedInteraction(uid: string | undefined, post: FeedPreferencePost, action: FeedInteraction) {
  if (!uid) return;
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    const next = applyFeedInteraction(raw ? JSON.parse(raw) : null, post, action);
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify(next));
    publish(uid, next);
  } catch { /* Personalization is best-effort; the feed remains usable if storage is unavailable. */ }
}

export async function clearFeedPreferences(uid: string) {
  try { await AsyncStorage.removeItem(storageKey(uid)); } catch { /* In-memory preferences still reset if storage is unavailable. */ }
  publish(uid, EMPTY_FEED_PREFERENCES);
}
