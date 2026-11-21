import { useFocusEffect } from "expo-router";
import { getFreshWithCache, onValueWithCache as onValue } from "@/lib/rtdb-cache";
import {
  endBefore,
  equalTo,
  get,
  limitToLast,
  orderByChild,
  query,
  ref,
  update,
  type DataSnapshot,
} from "firebase/database";
import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

const PAGE_SIZE = 15;
const BADGE_CACHE_MAX_AGE_MS = 30 * 1000;
const EMPTY_ITEMS: AppNotification[] = [];

export type AppNotification = {
  id: string;
  type: string;
  fromName?: string;
  fromUid?: string;
  fromPhoto?: string;
  postId?: string;
  postPreview?: string;
  group?: string;
  bloodRequestId?: string;
  requestId?: string;
  orderId?: string;
  productTitle?: string;
  productImage?: string;
  buyerName?: string;
  quantity?: number;
  marketOrderStatus?: string;
  timestamp?: number;
  sentAt?: number;
  read?: boolean;
};

type NotificationState = {
  uid: string | null;
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
};

function emptyState(uid: string | null, loading = false): NotificationState {
  return {
    uid,
    items: EMPTY_ITEMS,
    unreadCount: 0,
    loading,
    loadingMore: false,
    hasMore: false,
    error: "",
  };
}

function notificationsFromSnapshot(snapshot: DataSnapshot): AppNotification[] {
  const raw = snapshot.val() as Record<string, Omit<AppNotification, "id">> | null;
  if (!raw) return [];
  return Object.entries(raw)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function newestFirst(items: AppNotification[]) {
  return [...items].sort(
    (a, b) =>
      (b.sentAt || b.timestamp || 0) - (a.sentAt || a.timestamp || 0) ||
      b.id.localeCompare(a.id),
  );
}

function publicPostPreview(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const post = value as Record<string, unknown>;
  const privacy = typeof post.privacy === "string" ? post.privacy : "";
  if (privacy && privacy !== "public" && privacy !== "everyone") return "";
  const title = typeof post.title === "string" ? post.title.trim() : "";
  const body = [post.description, post.content, post.text, post.body].find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );
  const text = typeof body === "string" ? body.trim() : "";
  return [title, text].filter(Boolean).join(" · ").slice(0, 140);
}

function profilePhoto(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const profile = value as Record<string, unknown>;
  for (const key of ["profile_pic", "photoURL", "photoUrl", "avatar"]) {
    if (typeof profile[key] === "string" && profile[key].trim()) {
      return profile[key].trim();
    }
  }
  return "";
}

/** Lightweight Home badge mode: no notification-list listener or enrichment reads. */
export function useNotificationBadge() {
  const uid = pathargataAuth.currentUser?.uid || null;
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!uid) {
        setUnreadCount(0);
        return () => { active = false; };
      }
      const task = InteractionManager.runAfterInteractions(() => {
        const unreadQuery = query(
          ref(pathargataDb, `notifications/${uid}`),
          orderByChild("read"),
          equalTo(false),
        );
        void getFreshWithCache<Record<string, unknown>>(unreadQuery, BADGE_CACHE_MAX_AGE_MS)
          .then(({ value }) => {
            if (active) setUnreadCount(Object.keys(value || {}).length);
          })
          .catch(() => {
            if (active) setUnreadCount(0);
          });
      });
      return () => { active = false; task.cancel(); };
    }, [uid]),
  );

  return { unreadCount };
}

export function notificationSummary(item: Pick<AppNotification, "type" | "fromName" | "productTitle" | "quantity" | "marketOrderStatus">) {
  const actor = item.fromName || "একজন ব্যবহারকারী";
  if (item.type === "market_order") return `${actor} আপনার ${item.productTitle || "পণ্যে"} ${item.quantity || 1}টি অর্ডার করেছেন`;
  if (item.type === "market_order_update") {
    const labels: Record<string, string> = { accepted: "গৃহীত হয়েছে", preparing: "প্রস্তুত করা হচ্ছে", shipped: "পাঠানো হয়েছে", delivered: "ডেলিভারি সম্পন্ন", cancelled: "বাতিল হয়েছে" };
    return `আপনার অর্ডার ${labels[item.marketOrderStatus || ""] || "আপডেট হয়েছে"}`;
  }
  if (item.type === "like") return `${actor} আপনার পোস্টে লাইক দিয়েছেন`;
  if (item.type === "comment") return `${actor} আপনার পোস্টে মন্তব্য করেছেন`;
  if (item.type === "reply") return `${actor} আপনার মন্তব্যের উত্তর দিয়েছেন`;
  if (item.type === "repost") return `${actor} আপনার পোস্ট রিপোস্ট করেছেন`;
  if (item.type === "post_tag") return `${actor} আপনাকে পোস্টে উল্লেখ করেছেন`;
  if (item.type === "chat") return `${actor} আপনাকে মেসেজ করেছেন`;
  if (item.type === "blood_req") return "জরুরি রক্তের অনুরোধ এসেছে";
  return "আপনার জন্য নতুন আপডেট এসেছে";
}

export function useInAppNotificationBanner() {
  const uid = pathargataAuth.currentUser?.uid || null;
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const latestIdRef = useRef<string | null>(null);

  useEffect(() => {
      let active = true;
      latestIdRef.current = null;
      if (!uid) {
        queueMicrotask(() => {
          if (active) setNotification(null);
        });
        return () => { active = false; };
      }
      const latestQuery = query(
        ref(pathargataDb, `notifications/${uid}`),
        orderByChild("timestamp"),
        limitToLast(1),
      );
      const stop = onValue(latestQuery, (snapshot) => {
        if (!active) return;
        const latest = newestFirst(notificationsFromSnapshot(snapshot))[0];
        if (!latest) return;
        if (latestIdRef.current === null) {
          latestIdRef.current = latest.id;
          return;
        }
        if (latest.id !== latestIdRef.current) {
          latestIdRef.current = latest.id;
          setNotification(latest);
        }
      }, () => undefined);
      return () => { active = false; stop(); };
    }, [uid]);

  return { notification, dismiss: useCallback(() => setNotification(null), []) };
}

export function useNotifications() {
  const uid = pathargataAuth.currentUser?.uid || null;
  const [state, setState] = useState<NotificationState>(() =>
    emptyState(uid, Boolean(uid)),
  );
  const [retryAttempt, setRetryAttempt] = useState(0);
  const activeState = state.uid === uid ? state : emptyState(uid, Boolean(uid));
  const { items, unreadCount, loading, loadingMore, hasMore, error } = activeState;
  const allPagesLoadedRef = useRef(false);
  const recentIdsRef = useRef(new Set<string>());
  const enrichedKeysRef = useRef(new Set<string>());
  const profilePreviewCacheRef = useRef(new Map<string, Record<string, unknown> | null>());
  const postPreviewCacheRef = useRef(new Map<string, Record<string, unknown> | null>());

  useFocusEffect(
    useCallback(() => {
      allPagesLoadedRef.current = false;
      recentIdsRef.current = new Set();
      enrichedKeysRef.current = new Set();
      if (!uid) return;

      const notificationsRef = ref(pathargataDb, `notifications/${uid}`);
      const latestPageQuery = query(notificationsRef, limitToLast(PAGE_SIZE + 1));
      const unreadQuery = query(
        notificationsRef,
        orderByChild("read"),
        equalTo(false),
      );
      let isInitialPage = true;

      const stopPageListener = onValue(
        latestPageQuery,
        (snapshot) => {
          const snapshotItems = notificationsFromSnapshot(snapshot);
          const latestPage = newestFirst(snapshotItems.slice(-PAGE_SIZE));
          const latestIds = new Set(latestPage.map((item) => item.id));
          const hasNewNotification = latestPage.some(
            (item) => !recentIdsRef.current.has(item.id),
          );
          const initialPage = isInitialPage;
          isInitialPage = false;
          recentIdsRef.current = latestIds;

          setState((current) => {
            const base = current.uid === uid ? current : emptyState(uid);
            const merged = new Map(base.items.map((item) => [item.id, item]));
            for (const item of latestPage) merged.set(item.id, item);
            const nextHasMore = initialPage
              ? snapshotItems.length > PAGE_SIZE
              : hasNewNotification && !allPagesLoadedRef.current
                ? snapshotItems.length > PAGE_SIZE
                : base.hasMore;
            return {
              ...base,
              items: newestFirst([...merged.values()]),
              hasMore: nextHasMore,
              loading: false,
              error: "",
            };
          });
        },
        () => {
          setState((current) => {
            const base = current.uid === uid ? current : emptyState(uid);
            return {
              ...base,
              loading: false,
              error: "নোটিফিকেশন লোড করা যায়নি। আবার চেষ্টা করুন।",
            };
          });
        },
      );
      const stopUnreadListener = onValue(
        unreadQuery,
        (snapshot) => {
          const count = notificationsFromSnapshot(snapshot).length;
          setState((current) => {
            const base = current.uid === uid ? current : emptyState(uid);
            return { ...base, unreadCount: count };
          });
        },
        () => {
          setState((current) => {
            const base = current.uid === uid ? current : emptyState(uid);
            return { ...base, unreadCount: 0 };
          });
        },
      );

      return () => {
        stopPageListener();
        stopUnreadListener();
      };
    }, [retryAttempt, uid]),
  );

  const enrichNotifications = useCallback(
    async (candidates: AppNotification[]) => {
      if (!uid) return;
      const targets = candidates.filter((item) => {
        if ((!item.fromUid || item.fromPhoto) && (!item.postId || item.postPreview)) return false;
        const key = `${uid}:${item.id}`;
        if (enrichedKeysRef.current.has(key)) return false;
        enrichedKeysRef.current.add(key);
        return true;
      });

      const profileIds = [...new Set(targets.flatMap((item) => item.fromUid && !item.fromPhoto ? [item.fromUid] : []))];
      const postIds = [...new Set(targets.flatMap((item) => item.postId && !item.postPreview ? [item.postId] : []))];
      await Promise.all([
        ...profileIds.filter((id) => !profilePreviewCacheRef.current.has(id)).map(async (id) => {
          try {
            const { value } = await getFreshWithCache<Record<string, unknown>>(ref(pathargataDb, `people_index/${id}`), 10 * 60 * 1000);
            profilePreviewCacheRef.current.set(id, value || null);
          } catch {
            profilePreviewCacheRef.current.set(id, null);
          }
        }),
        ...postIds.filter((id) => !postPreviewCacheRef.current.has(id)).map(async (id) => {
          try {
            const { value } = await getFreshWithCache<Record<string, unknown>>(ref(pathargataDb, `posts/${id}`), 10 * 60 * 1000);
            postPreviewCacheRef.current.set(id, value || null);
          } catch {
            postPreviewCacheRef.current.set(id, null);
          }
        }),
      ]);
      await Promise.all(targets.map(async (item) => {
          try {
            const fromPhoto = item.fromUid ? profilePhoto(profilePreviewCacheRef.current.get(item.fromUid)) || item.fromPhoto : item.fromPhoto;
            const postValue = item.postId ? postPreviewCacheRef.current.get(item.postId) : null;
            const postPreview = item.postId ? publicPostPreview(postValue) || item.postPreview : item.postPreview;
            if (!fromPhoto && !postPreview) return;
            setState((current) => {
              const base = current.uid === uid ? current : emptyState(uid);
              return {
                ...base,
                items: base.items.map((candidate) =>
                  candidate.id === item.id
                    ? { ...candidate, fromPhoto, postPreview }
                    : candidate,
                ),
              };
            });
          } catch {
            // The notification remains usable with its stored name and type.
          }
        }));
    },
    [uid],
  );

  useEffect(() => {
    void enrichNotifications(items);
  }, [enrichNotifications, items]);

  const loadMore = useCallback(async () => {
    if (!uid || !hasMore || loadingMore) return;
    const cursor = items.reduce(
      (oldestId, item) => (item.id < oldestId ? item.id : oldestId),
      items[0]?.id || "",
    );
    if (!cursor) {
      allPagesLoadedRef.current = true;
      setState((current) => {
        const base = current.uid === uid ? current : emptyState(uid);
        return { ...base, hasMore: false };
      });
      return;
    }

    setState((current) => {
      const base = current.uid === uid ? current : emptyState(uid);
      return { ...base, loadingMore: true, error: "" };
    });

    try {
      const olderPageQuery = query(
        ref(pathargataDb, `notifications/${uid}`),
        endBefore(cursor),
        limitToLast(PAGE_SIZE + 1),
      );
      const snapshot = await get(olderPageQuery);
      const candidates = notificationsFromSnapshot(snapshot).filter(
        (item) => !items.some((loaded) => loaded.id === item.id),
      );
      const page = newestFirst(candidates.slice(-PAGE_SIZE));
      const more = candidates.length > PAGE_SIZE;

      setState((current) => {
        const base = current.uid === uid ? current : emptyState(uid);
        const merged = new Map(base.items.map((item) => [item.id, item]));
        for (const item of page) merged.set(item.id, item);
        return {
          ...base,
          items: newestFirst([...merged.values()]),
          hasMore: more,
          loadingMore: false,
          error: "",
        };
      });
      if (!more) allPagesLoadedRef.current = true;
    } catch {
      setState((current) => {
        const base = current.uid === uid ? current : emptyState(uid);
        return {
          ...base,
          loadingMore: false,
          error: "আরও নোটিফিকেশন লোড করা যায়নি। আবার চেষ্টা করুন।",
        };
      });
    }
  }, [hasMore, items, loadingMore, uid]);

  const markRead = useCallback(
    async (notificationIds: string | string[]) => {
      if (!uid) return;
      const ids = Array.isArray(notificationIds)
        ? notificationIds.filter(Boolean)
        : [notificationIds];
      if (!ids.length) return;
      try {
        const updates: Record<string, boolean> = {};
        ids.forEach((id) => {
          updates[`${id}/read`] = true;
        });
        await update(ref(pathargataDb, `notifications/${uid}`), updates);
        setState((current) => {
          const base = current.uid === uid ? current : emptyState(uid);
          const idSet = new Set(ids);
          return {
            ...base,
            items: base.items.map((item) =>
              idSet.has(item.id) ? { ...item, read: true } : item,
            ),
            error: "",
          };
        });
      } catch {
        setState((current) => {
          const base = current.uid === uid ? current : emptyState(uid);
          return {
            ...base,
            error: "নোটিফিকেশন পড়া হয়েছে হিসেবে চিহ্নিত করা যায়নি।",
          };
        });
      }
    },
    [uid],
  );

  const markUnread = useCallback(
    async (notificationIds: string | string[]) => {
      if (!uid) return;
      const ids = Array.isArray(notificationIds)
        ? notificationIds.filter(Boolean)
        : [notificationIds];
      if (!ids.length) return;
      try {
        const updates: Record<string, boolean> = {};
        ids.forEach((id) => {
          updates[`${id}/read`] = false;
        });
        await update(ref(pathargataDb, `notifications/${uid}`), updates);
        setState((current) => {
          const base = current.uid === uid ? current : emptyState(uid);
          const idSet = new Set(ids);
          return {
            ...base,
            items: base.items.map((item) =>
              idSet.has(item.id) ? { ...item, read: false } : item,
            ),
            error: "",
          };
        });
      } catch {
        setState((current) => {
          const base = current.uid === uid ? current : emptyState(uid);
          return { ...base, error: "নোটিফিকেশনের অবস্থা বদলানো যায়নি।" };
        });
      }
    },
    [uid],
  );

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    try {
      const unreadSnapshot = await get(
        query(
          ref(pathargataDb, `notifications/${uid}`),
          orderByChild("read"),
          equalTo(false),
        ),
      );
      const updates: Record<string, boolean> = {};
      unreadSnapshot.forEach((child) => {
        if (child.key) updates[`${child.key}/read`] = true;
      });
      if (Object.keys(updates).length) {
        await update(ref(pathargataDb, `notifications/${uid}`), updates);
      }
      setState((current) => {
        const base = current.uid === uid ? current : emptyState(uid);
        return {
          ...base,
          items: base.items.map((item) => ({ ...item, read: true })),
          error: "",
        };
      });
    } catch {
      setState((current) => {
        const base = current.uid === uid ? current : emptyState(uid);
        return {
          ...base,
          error: "সব নোটিফিকেশন পড়া হয়েছে হিসেবে চিহ্নিত করা যায়নি।",
        };
      });
    }
  }, [uid]);

  const retry = useCallback(() => {
    allPagesLoadedRef.current = false;
    recentIdsRef.current = new Set();
    setState((current) => {
      const base = current.uid === uid ? current : emptyState(uid);
      return { ...base, loading: Boolean(uid), error: "" };
    });
    setRetryAttempt((value) => value + 1);
  }, [uid]);

  return {
    items,
    unreadCount,
    markRead,
    markUnread,
    markAllRead,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    retry,
    error,
  };
}
