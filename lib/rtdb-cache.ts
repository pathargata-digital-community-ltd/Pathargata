import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  get,
  onValue as firebaseOnValue,
  type DataSnapshot,
  type Query,
  type Unsubscribe,
} from "firebase/database";

const CACHE_PREFIX = "pathargata-rtdb-snapshot-v1:";
const INDEX_KEY = `${CACHE_PREFIX}index`;
const MAX_ENTRY_CHARS = 750_000;
const MAX_TOTAL_CHARS = 4_000_000;
const MAX_ENTRIES = 48;

type CacheEntry<T = unknown> = {
  version: 1;
  savedAt: number;
  value: T;
};

type CacheIndexEntry = {
  key: string;
  savedAt: number;
  size: number;
};

export type RtdbCacheSource = "cache" | "firebase";

export type RtdbCacheOptions = {
  /** When set, a snapshot younger than this skips attaching a Firebase listener. */
  maxAgeMs?: number;
};

let writeQueue: Promise<void> = Promise.resolve();
let currentCacheUid: string | null = null;
let cacheSessionId = 0;
export function setRtdbCacheUser(uid: string | null | undefined): void {
  const nextUid = uid || null;
  if (nextUid !== currentCacheUid) cacheSessionId += 1;
  currentCacheUid = nextUid;
}
export function isRtdbCacheSessionCurrent(
  uid: string | null,
  sessionId: number,
  currentUid = currentCacheUid,
  currentSessionId = cacheSessionId,
): boolean {
  return uid === currentUid && sessionId === currentSessionId;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function createRtdbSnapshotCacheKey(
  path: string,
  queryParameters: unknown,
  uid: string | null | undefined,
): string {
  const owner = uid ? `user:${uid}` : "guest";
  return `${owner}|${path}|${stableStringify(queryParameters ?? {})}`;
}

/** Avoid persisting full account trees or unbounded high-volume collections. */
export function shouldCacheRtdbQuery(path: string, queryParameters: unknown): boolean {
  const segments = normalizeDatabasePath(path).split("/").filter(Boolean);
  const parameters = queryParameters && typeof queryParameters === "object"
    ? queryParameters as Record<string, unknown>
    : {};
  const isBounded = typeof parameters.l === "number" || parameters.limitSet_ === true;
  if (segments.length === 2 && segments[0] === "users") return false;
  if (segments.length === 3 && segments[0] === "users" && segments[2] === "friends") return false;
  if (segments.length === 3 && segments[0] === "users" && ["saved_posts", "saved"].includes(segments[2])) return isBounded;
  if (segments.length === 1 && ["public_posts", "market_items", "market_shops", "posts", "users"].includes(segments[0])) return isBounded;
  if (segments.length === 2 && ["user_post_index", "friends_post_index"].includes(segments[0])) return isBounded;
  return true;
}

function queryCacheKey(query: Query): string {
  const queryInternals = query as Query & {
    _queryObject?: Record<string, unknown>;
  };
  return createRtdbSnapshotCacheKey(
    query.ref.toString(),
    queryInternals._queryObject,
    currentCacheUid,
  );
}

function canCacheQuery(query: Query): boolean {
  const queryInternals = query as Query & { _queryObject?: Record<string, unknown> };
  try {
    return shouldCacheRtdbQuery(new URL(query.ref.toString()).pathname, queryInternals._queryObject);
  } catch {
    return false;
  }
}

function storageKey(logicalKey: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(logicalKey)}`;
}

function normalizeDatabasePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function doesRtdbCachePathMatch(logicalKey: string, changedPath: string): boolean {
  const normalizedChangedPath = normalizeDatabasePath(changedPath);
  if (!normalizedChangedPath) return false;
  const firstSeparator = logicalKey.indexOf("|");
  const secondSeparator = logicalKey.indexOf("|", firstSeparator + 1);
  if (firstSeparator < 0 || secondSeparator < 0) return false;
  const databaseUrl = logicalKey.slice(firstSeparator + 1, secondSeparator);
  try {
    const cachedPath = normalizeDatabasePath(new URL(databaseUrl).pathname);
    return cachedPath === normalizedChangedPath ||
      cachedPath.startsWith(`${normalizedChangedPath}/`) ||
      normalizedChangedPath.startsWith(`${cachedPath}/`);
  } catch {
    return false;
  }
}

export function isRtdbCacheFresh(
  savedAt: number,
  maxAgeMs: number,
  now = Date.now(),
): boolean {
  return maxAgeMs > 0 && savedAt <= now && now - savedAt <= maxAgeMs;
}

async function readCache<T>(logicalKey: string): Promise<CacheEntry<T> | null> {
  try {
    const serialized = await AsyncStorage.getItem(storageKey(logicalKey));
    if (!serialized) return null;
    const parsed: unknown = JSON.parse(serialized);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as CacheEntry).version !== 1 ||
      typeof (parsed as CacheEntry).savedAt !== "number" ||
      !("value" in parsed)
    ) {
      return null;
    }
    return parsed as CacheEntry<T>;
  } catch {
    return null;
  }
}

async function readIndex(): Promise<CacheIndexEntry[]> {
  try {
    const serialized = await AsyncStorage.getItem(INDEX_KEY);
    if (!serialized) return [];
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CacheIndexEntry =>
        !!entry &&
        typeof entry.key === "string" &&
        typeof entry.savedAt === "number" &&
        typeof entry.size === "number",
    );
  } catch {
    return [];
  }
}

function persistCache<T>(logicalKey: string, value: T): void {
  let serialized: string;
  try {
    serialized = JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      value,
    } satisfies CacheEntry<T>);
  } catch {
    return;
  }
  if (!serialized || serialized.length > MAX_ENTRY_CHARS) return;

  const targetKey = storageKey(logicalKey);
  const operation = writeQueue.then(async () => {
    try {
      const now = Date.now();
      let index = (await readIndex()).filter(
        (entry) => entry.key !== targetKey,
      );
      index.push({ key: targetKey, savedAt: now, size: serialized.length });
      index.sort((a, b) => a.savedAt - b.savedAt);

      let total = index.reduce((sum, entry) => sum + entry.size, 0);
      const removeKeys: string[] = [];
      while (index.length > MAX_ENTRIES || total > MAX_TOTAL_CHARS) {
        const oldest = index.shift();
        if (!oldest || oldest.key === targetKey) break;
        removeKeys.push(oldest.key);
        total -= oldest.size;
      }
      if (removeKeys.length) await AsyncStorage.multiRemove(removeKeys);
      await AsyncStorage.setItem(targetKey, serialized);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      // A cache write must never interrupt the Firebase listener or UI update.
    }
  });
  writeQueue = operation.catch(() => undefined);
}

function valueAtPath(value: unknown, path: string): unknown {
  return path
    .split("/")
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
}

function makeCachedSnapshot(value: unknown, query: Query): DataSnapshot {
  const countChildren = (current: unknown) =>
    current && typeof current === "object" ? Object.keys(current).length : 0;
  const snapshot = (current: unknown): DataSnapshot => {
    const result = {
      key: query.ref.key,
      ref: query.ref,
      val: () => current,
      exists: () => current !== null && current !== undefined,
      child: (path: string) => snapshot(valueAtPath(current, path)),
      hasChild: (path: string) => valueAtPath(current, path) !== undefined,
      hasChildren: () => countChildren(current) > 0,
      numChildren: () => countChildren(current),
      forEach: (action: (child: DataSnapshot) => boolean | void) => {
        if (!current || typeof current !== "object") return false;
        for (const [key, childValue] of Object.entries(
          current as Record<string, unknown>,
        )) {
          const child = snapshot(childValue);
          Object.defineProperty(child, "key", { value: key });
          if (action(child) === true) return true;
        }
        return false;
      },
      exportVal: () => current,
      get priority() {
        return null;
      },
      get size() {
        return countChildren(current);
      },
    };
    return result as unknown as DataSnapshot;
  };
  return snapshot(value);
}

/**
 * Drop-in replacement for RTDB onValue. It hydrates a saved snapshot immediately,
 * then always attaches the live Firebase listener. Fresh listener data wins any
 * cache race; a listener error does not replace usable stale data with an empty UI.
 */
export function onValueWithCache(
  query: Query,
  callback: (snapshot: DataSnapshot) => void,
  cancelCallback?: (error: Error) => void,
  options: RtdbCacheOptions = {},
): Unsubscribe {
  const ownerUid = currentCacheUid;
  const ownerSessionId = cacheSessionId;
  const key = queryCacheKey(query);
  const cacheAllowed = canCacheQuery(query);
  let active = true;
  let hasCachedSnapshot = false;
  let unsubscribe: Unsubscribe = () => undefined;
  void (cacheAllowed ? readCache(key) : Promise.resolve(null)).then((entry) => {
    if (!active || !isRtdbCacheSessionCurrent(ownerUid, ownerSessionId)) return;
    hasCachedSnapshot = entry !== null;
    if (entry) callback(makeCachedSnapshot(entry.value, query));
    if (entry && options.maxAgeMs !== undefined && isRtdbCacheFresh(entry.savedAt, options.maxAgeMs)) {
      return;
    }

    const liveUnsubscribe = firebaseOnValue(
      query,
      (snapshot) => {
        if (!active || !isRtdbCacheSessionCurrent(ownerUid, ownerSessionId)) return;
        callback(snapshot);
        if (cacheAllowed) persistCache(key, snapshot.val());
      },
      (error) => {
        if (active && isRtdbCacheSessionCurrent(ownerUid, ownerSessionId) && !hasCachedSnapshot) cancelCallback?.(error);
      },
    );
    unsubscribe = liveUnsubscribe;
    if (!active) liveUnsubscribe();
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

/** Always requests Firebase's latest value; returns the saved snapshot only if that read fails. */
export async function getWithCache<T = unknown>(
  query: Query,
  onCached?: (value: T) => void,
): Promise<{
  value: T | null;
  source: RtdbCacheSource;
  error?: Error;
}> {
  const key = queryCacheKey(query);
  const cacheAllowed = canCacheQuery(query);
  const cached = cacheAllowed ? await readCache<T>(key) : null;
  if (cached) onCached?.(cached.value);
  try {
    const snapshot = await get(query);
    const value = snapshot.val() as T;
    if (cacheAllowed) persistCache(key, value);
    return { value, source: "firebase" };
  } catch (error) {
    if (cached) {
      return {
        value: cached.value,
        source: "cache",
        error:
          error instanceof Error ? error : new Error("সার্ভার থেকে তথ্য পড়া যায়নি"),
      };
    }
    return {
      value: null,
      source: "cache",
      error: error instanceof Error ? error : new Error("সার্ভার থেকে তথ্য পড়া যায়নি"),
    };
  }
}

/** Uses a fresh saved snapshot without a network read; refreshes expired data. */
export async function getFreshWithCache<T = unknown>(
  query: Query,
  maxAgeMs: number,
): Promise<{
  value: T | null;
  source: RtdbCacheSource;
  error?: Error;
}> {
  const key = queryCacheKey(query);
  const cacheAllowed = canCacheQuery(query);
  const cached = cacheAllowed ? await readCache<T>(key) : null;
  if (cached && isRtdbCacheFresh(cached.savedAt, maxAgeMs)) {
    return { value: cached.value, source: "cache" };
  }
  try {
    const snapshot = await get(query);
    const value = snapshot.val() as T;
    if (cacheAllowed) persistCache(key, value);
    return { value, source: "firebase" };
  } catch (error) {
    return {
      value: cached?.value ?? null,
      source: "cache",
      error: error instanceof Error ? error : new Error("সার্ভার থেকে তথ্য পড়া যায়নি"),
    };
  }
}

export async function clearRtdbSnapshotCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
  } catch {
    // Cache cleanup is best-effort and must not block account or app flows.
  }
}

/** Invalidates cached snapshots whose database URL is the changed path or its ancestor/descendant. */
export async function invalidateRtdbSnapshotCache(paths: string[]): Promise<void> {
  const normalizedPaths = paths
    .map(normalizeDatabasePath)
    .filter(Boolean);
  if (!normalizedPaths.length) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const removeKeys = keys.filter((key) => {
      if (!key.startsWith(CACHE_PREFIX) || key === INDEX_KEY) return false;
      let logicalKey = "";
      try {
        logicalKey = decodeURIComponent(key.slice(CACHE_PREFIX.length));
      } catch {
        return false;
      }
      return normalizedPaths.some((path) => doesRtdbCachePathMatch(logicalKey, path));
    });
    if (!removeKeys.length) return;
    await AsyncStorage.multiRemove(removeKeys);
    const removed = new Set(removeKeys);
    const index = await readIndex();
    await AsyncStorage.setItem(
      INDEX_KEY,
      JSON.stringify(index.filter((entry) => !removed.has(entry.key))),
    );
  } catch {
    // Invalidation is best-effort; the next Firebase read still refreshes data.
  }
}

/** Removes persisted data that could otherwise survive a logout or account switch. */
export async function clearUserScopedLocalCache(uid: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const userPrefixes = [
      `pathargata-native-feed-v1:${uid}`,
      `pathargata-native-feed-v2:${uid}`,
      `pathargata-feed-preferences-v1:${uid}`,
      `pathargata-chat-draft:${uid}:`,
      `tourism:preferences:v1:${uid}`,
    ];
    const removeKeys = keys.filter(
      (key) =>
        key.startsWith(CACHE_PREFIX) ||
        userPrefixes.some((prefix) => key.startsWith(prefix)),
    );
    if (removeKeys.length) await AsyncStorage.multiRemove(removeKeys);
  } catch {
    // Cache cleanup is best-effort and must not block auth transitions.
  }
}
