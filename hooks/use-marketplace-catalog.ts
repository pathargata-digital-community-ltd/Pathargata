import { getWithCache, onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { compareMarketplaceRtdbKeys, getMarketplacePageCursor, mergeMarketplacePages } from "@/lib/marketplace-catalog";
import { endBefore, equalTo, get, limitToLast, orderByChild, query, ref } from "firebase/database";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

export type MarketShopRecord = {
  id: string;
  uid?: string;
  ownerName?: string;
  name: string;
  category: string;
  phone?: string;
  address: string;
  union?: string;
  village?: string;
  desc?: string;
  logo?: string;
  verified?: boolean;
  time: number;
  [key: string]: unknown;
};
export type MarketProductRecord = {
  id: string;
  uid?: string;
  shopId?: string;
  title: string;
  name?: string;
  price: string;
  category?: string;
  desc?: string;
  description?: string;
  seller: string;
  image?: string;
  images: string[];
  stock?: number;
  availability?: string;
  time: number;
  address?: string;
  union?: string;
  village?: string;
  [key: string]: unknown;
};
export type MarketFavoriteState = { shops: Record<string, boolean>; products: Record<string, boolean> };
export type MarketplaceSourceError = { shops?: string; products?: string; favorites?: string };

const PAGE_SIZE = 24;
const MAX_CATALOG_ITEMS = 200;
const MARKET_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
function rows(value: unknown): [string, Record<string, unknown>][] {
  return value && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>).filter(([, item]) => item && typeof item === "object") as [string, Record<string, unknown>][]
    : [];
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function strings(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).filter((item): item is string => typeof item === "string" && Boolean(item));
}
function mapShops(value: unknown): MarketShopRecord[] {
  return rows(value).map(([id, raw]) => ({
    id,
    uid: stringValue(raw.uid),
    ownerName: stringValue(raw.ownerName),
    name: stringValue(raw.name) || "দোকান",
    category: stringValue(raw.category) || "সাধারণ",
    phone: stringValue(raw.phone),
    address: stringValue(raw.address) || "ঠিকানা উল্লেখ নেই",
    union: stringValue(raw.union),
    village: stringValue(raw.village),
    desc: stringValue(raw.desc),
    logo: stringValue(raw.logo),
    verified: raw.verified === true,
    time: numberValue(raw.time),
  }));
}
function mapProducts(value: unknown): MarketProductRecord[] {
  return rows(value).map(([id, raw]) => ({
    id,
    uid: stringValue(raw.uid),
    shopId: stringValue(raw.shopId),
    title: stringValue(raw.title) || "পণ্য",
    name: stringValue(raw.title) || "পণ্য",
    price: stringValue(raw.price) || "দাম উল্লেখ নেই",
    category: stringValue(raw.category),
    desc: stringValue(raw.desc),
    description: [stringValue(raw.desc), stringValue(raw.seller)].filter(Boolean).join(" "),
    seller: stringValue(raw.seller) || "বিক্রেতা",
    image: stringValue(raw.image),
    images: strings(raw.images || raw.image),
    stock: raw.stock === undefined || raw.stock === null || raw.stock === "" ? undefined : numberValue(raw.stock),
    availability: stringValue(raw.availability),
    time: numberValue(raw.time || raw.timestamp),
  }));
}
function sortShops(page: MarketShopRecord[], currentUid?: string): MarketShopRecord[] {
  return page.sort((a, b) => {
    const aMine = currentUid && a.uid === currentUid ? 1 : 0;
    const bMine = currentUid && b.uid === currentUid ? 1 : 0;
    return bMine - aMine || b.time - a.time || compareMarketplaceRtdbKeys(b.id, a.id);
  });
}
function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "ইন্টারনেট বা সার্ভার permission পরীক্ষা করে আবার চেষ্টা করুন।";
}

/** Loads only the newest catalog page first; FlatList and explicit load-more keep UI work bounded. */
export function useMarketplaceCatalog() {
  const [shops, setShops] = useState<MarketShopRecord[]>([]);
  const [products, setProducts] = useState<MarketProductRecord[]>([]);
  const [favorites, setFavorites] = useState<MarketFavoriteState>({ shops: {}, products: {} });
  const [shopProducts, setShopProducts] = useState<Record<string, MarketProductRecord[]>>({});
  const [shopProductsLoading, setShopProductsLoading] = useState<Record<string, boolean>>({});
  const [shopProductsErrors, setShopProductsErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<MarketplaceSourceError>({});
  const [loading, setLoading] = useState({ shops: true, products: true, favorites: true });
  const [loadingMore, setLoadingMore] = useState({ shops: false, products: false });
  const [hasMore, setHasMore] = useState({ shops: false, products: false });
  const [cursors, setCursors] = useState<{ shops: { time: number; id: string } | null; products: { time: number; id: string } | null }>({ shops: null, products: null });
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);

  const reload = useCallback(() => {
    setErrors({});
    setLoading({ shops: true, products: true, favorites: true });
    setHasMore({ shops: false, products: false });
    setCursors({ shops: null, products: null });
    setShops([]);
    setProducts([]);
    setShopProducts({});
    setShopProductsErrors({});
    generationRef.current += 1;
    setGeneration(generationRef.current);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    const requestGeneration = generation;
    const currentUid = pathargataAuth.currentUser?.uid;
    void getWithCache(query(ref(pathargataDb, "market_shops"), orderByChild("time"), limitToLast(PAGE_SIZE))).then(({ value: raw, error }) => {
      if (!active || generationRef.current !== requestGeneration) return;
      if (error && !raw) throw error;
      const page = sortShops(mapShops(raw), currentUid);
      setShops(page);
      setCursors((current) => ({ ...current, shops: getMarketplacePageCursor(page) }));
      setHasMore((current) => ({ ...current, shops: page.length === PAGE_SIZE }));
      setLoading((state) => ({ ...state, shops: false }));
      setErrors((state) => ({ ...state, shops: undefined }));
    }).catch((error) => {
      if (!active || generationRef.current !== requestGeneration) return;
      setErrors((state) => ({ ...state, shops: errorText(error) }));
      setLoading((state) => ({ ...state, shops: false }));
    });
    void getWithCache(query(ref(pathargataDb, "market_items"), orderByChild("time"), limitToLast(PAGE_SIZE))).then(({ value: raw, error }) => {
      if (!active || generationRef.current !== requestGeneration) return;
      if (error && !raw) throw error;
      const page = mapProducts(raw).sort((a, b) => b.time - a.time || compareMarketplaceRtdbKeys(b.id, a.id));
      setProducts(page);
      setCursors((current) => ({ ...current, products: getMarketplacePageCursor(page) }));
      setHasMore((current) => ({ ...current, products: page.length === PAGE_SIZE }));
      setLoading((state) => ({ ...state, products: false }));
      setErrors((state) => ({ ...state, products: undefined }));
    }).catch((error) => {
      if (!active || generationRef.current !== requestGeneration) return;
      setErrors((state) => ({ ...state, products: errorText(error) }));
      setLoading((state) => ({ ...state, products: false }));
    });
    const uid = currentUid;
    if (!uid) {
      setLoading((state) => ({ ...state, favorites: false }));
    }
    const unsubFavorites = uid ? onValue(
      ref(pathargataDb, `market_favorites/${uid}`),
      (snapshot) => {
        if (!active) return;
        const value = snapshot.val() || {};
        setFavorites({ shops: value.shops || {}, products: value.products || {} });
        setLoading((state) => ({ ...state, favorites: false }));
        setErrors((state) => ({ ...state, favorites: undefined }));
      },
      (error) => {
        if (!active) return;
        setErrors((state) => ({ ...state, favorites: errorText(error) }));
        setLoading((state) => ({ ...state, favorites: false }));
      },
      { maxAgeMs: MARKET_CACHE_MAX_AGE_MS },
    ) : () => undefined;
    return () => {
      active = false;
      unsubFavorites();
    };
  }, [generation]));

  const loadShopProducts = useCallback(async (shopId: string) => {
    if (!shopId) return;
    setShopProductsLoading((current) => ({ ...current, [shopId]: true }));
    setShopProductsErrors((current) => ({ ...current, [shopId]: "" }));
    try {
      const snapshot = await get(query(ref(pathargataDb, "market_items"), orderByChild("shopId"), equalTo(shopId)));
      const records = mapProducts(snapshot.val()).sort((a, b) => b.time - a.time || compareMarketplaceRtdbKeys(b.id, a.id));
      setShopProducts((current) => ({ ...current, [shopId]: records }));
    } catch (error) {
      setShopProductsErrors((current) => ({ ...current, [shopId]: errorText(error) }));
    } finally {
      setShopProductsLoading((current) => ({ ...current, [shopId]: false }));
    }
  }, []);

  const loadMore = useCallback(async (kind: "shops" | "products") => {
    if (loadingMore[kind] || !hasMore[kind]) return;
    const currentCount = kind === "shops" ? shops.length : products.length;
    const remainingCapacity = MAX_CATALOG_ITEMS - currentCount;
    if (remainingCapacity <= 0) {
      setHasMore((state) => ({ ...state, [kind]: false }));
      return;
    }
    const pageSize = Math.min(PAGE_SIZE, remainingCapacity);
    const cursor = cursors[kind];
    if (!cursor) {
      setHasMore((state) => ({ ...state, [kind]: false }));
      return;
    }
    setLoadingMore((state) => ({ ...state, [kind]: true }));
    setErrors((state) => ({ ...state, [kind]: undefined }));
    try {
      let page: (MarketShopRecord | MarketProductRecord)[] = [];
      if (kind === "shops") {
        const { value, error } = await getWithCache(query(ref(pathargataDb, "market_shops"), orderByChild("time"), endBefore(cursor.time, cursor.id), limitToLast(pageSize)));
        if (error && !value) throw error;
        page = mapShops(value).sort((a, b) => b.time - a.time || compareMarketplaceRtdbKeys(b.id, a.id));
        setShops((current) => sortShops(mergeMarketplacePages(current, page as MarketShopRecord[]), pathargataAuth.currentUser?.uid));
      } else {
        const { value, error } = await getWithCache(query(ref(pathargataDb, "market_items"), orderByChild("time"), endBefore(cursor.time, cursor.id), limitToLast(pageSize)));
        if (error && !value) throw error;
        page = mapProducts(value).sort((a, b) => b.time - a.time || compareMarketplaceRtdbKeys(b.id, a.id));
        setProducts((current) => mergeMarketplacePages(current, page as MarketProductRecord[]));
      }
      const nextCursor = getMarketplacePageCursor(page);
      if (nextCursor) setCursors((current) => ({ ...current, [kind]: nextCursor }));
      setHasMore((current) => ({ ...current, [kind]: page.length === pageSize && currentCount + page.length < MAX_CATALOG_ITEMS }));
    } catch (error) {
      setErrors((state) => ({ ...state, [kind]: errorText(error) }));
    } finally {
      setLoadingMore((state) => ({ ...state, [kind]: false }));
    }
  }, [cursors, hasMore, loadingMore, shops.length, products.length]);

  return {
    shops,
    products,
    shopProducts,
    shopProductsLoading,
    shopProductsErrors,
    loadShopProducts,
    favorites,
    errors,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload,
  };
}
