export type MarketplaceCatalogItem = {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  price?: string | number;
  category?: string;
  time?: number | string;
  stock?: number | string | boolean;
  availability?: string | boolean;
  shopId?: string;
  address?: string;
  union?: string;
  village?: string;
  [key: string]: unknown;
};

export type MarketplaceCatalogFilters = {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  locality?: string;
  availability?: "available" | "unavailable" | "all";
};

export type MarketplaceSort = "newest" | "price-low" | "price-high";
export type MarketplacePageCursor = { time: number; id: string };

export function compareMarketplaceRtdbKeys(a: string, b: string): number {
  const integerKey = (key: string) => {
    if (!/^(0|[1-9]\d*)$/.test(key)) return null;
    const value = Number(key);
    return Number.isSafeInteger(value) && value <= 0xffffffff ? value : null;
  };
  const numberA = integerKey(a);
  const numberB = integerKey(b);
  if (numberA !== null && numberB !== null) return numberA - numberB;
  if (numberA !== null) return -1;
  if (numberB !== null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Finds the oldest item in an RTDB page, using the key as the stable timestamp tie-breaker. */
export function getMarketplacePageCursor(items: readonly { id: string; time: number }[]): MarketplacePageCursor | null {
  if (!items.length) return null;
  return items.reduce((oldest, item) =>
    item.time < oldest.time || (item.time === oldest.time && compareMarketplaceRtdbKeys(item.id, oldest.id) < 0) ? item : oldest,
  );
}

/** Parse a Taka amount, supporting Bengali/Latin numerals and common grouping separators. */
export function parseTakaPrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits: Record<string, string> = { "০":"0", "১":"1", "২":"2", "৩":"3", "৪":"4", "৫":"5", "৬":"6", "৭":"7", "৮":"8", "৯":"9" };
  const normalized = String(value).replace(/[০-৯]/g, (digit) => digits[digit]);
  const match = normalized.match(/[+-]?(?:\d[\d,٬.\s]*\d|\d)(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0].replace(/[ ,٬]/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Normalize text for locale-insensitive substring matching. */
export function normalizeMarketplaceText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).normalize("NFKC").toLocaleLowerCase().replace(/[\u200b-\u200f\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function itemPrice(item: MarketplaceCatalogItem): number | null {
  return parseTakaPrice(item.price ?? item.productPrice);
}
function timeOf(item: MarketplaceCatalogItem): number {
  const value = item.time;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return date;
  }
  return 0;
}
function isUnavailable(item: MarketplaceCatalogItem): boolean {
  const availability = item.availability;
  if (availability === false) return true;
  if (typeof availability === "string" && /^(?:unavailable|out\s*of\s*stock|sold\s*out|নেই|শেষ)$/i.test(normalizeMarketplaceText(availability))) return true;
  const stock = item.stock;
  if (stock === false) return true;
  if (typeof stock === "number") return stock <= 0;
  if (typeof stock === "string" && stock.trim() !== "") {
    const number = Number(stock);
    if (Number.isFinite(number)) return number <= 0;
    return /^(?:unavailable|out\s*of\s*stock|sold\s*out|নেই|শেষ)$/i.test(normalizeMarketplaceText(stock));
  }
  return false;
}

/** Apply text, category, price, locality and availability filters without mutating rows. */
export function filterMarketplaceCatalog<T extends MarketplaceCatalogItem>(items: readonly T[], filters: MarketplaceCatalogFilters = {}): T[] {
  const query = normalizeMarketplaceText(filters.search);
  const category = normalizeMarketplaceText(filters.category);
  const locality = normalizeMarketplaceText(filters.locality);
  return items.filter((item) => {
    if (category && normalizeMarketplaceText(item.category) !== category) return false;
    if (query) {
      const searchable = [item.name, item.title, item.description, item.category, item.address, item.union, item.village].map(normalizeMarketplaceText).join(" ");
      if (!searchable.includes(query)) return false;
    }
    if (locality && ![item.address, item.union, item.village].map(normalizeMarketplaceText).some((value) => value.includes(locality))) return false;
    const price = itemPrice(item);
    if (filters.minPrice !== undefined && (price === null || price < filters.minPrice)) return false;
    if (filters.maxPrice !== undefined && (price === null || price > filters.maxPrice)) return false;
    if (filters.availability === "available" && isUnavailable(item)) return false;
    if (filters.availability === "unavailable" && !isUnavailable(item)) return false;
    return true;
  });
}

/** Sort catalog rows; ties retain their original order. */
export function sortMarketplaceCatalog<T extends MarketplaceCatalogItem>(items: readonly T[], sort: MarketplaceSort = "newest"): T[] {
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    let difference = 0;
    if (sort === "price-low" || sort === "price-high") {
      const ap = itemPrice(a.item) ?? (sort === "price-low" ? Infinity : -Infinity);
      const bp = itemPrice(b.item) ?? (sort === "price-low" ? Infinity : -Infinity);
      difference = sort === "price-low" ? ap - bp : bp - ap;
    } else difference = timeOf(b.item) - timeOf(a.item);
    return difference || a.index - b.index;
  }).map(({ item }) => item);
}

/** Return distinct non-empty categories represented by available catalog items. */
export function getMarketplaceCategoryOptions(items: readonly MarketplaceCatalogItem[]): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const item of items) {
    const category = typeof item.category === "string" ? item.category.trim() : "";
    const key = normalizeMarketplaceText(category);
    if (category && !isUnavailable(item) && !seen.has(key)) { seen.add(key); categories.push(category); }
  }
  return categories;
}

/** Merge paginated rows by id (first occurrence wins), then order newest-first stably. */
export function mergeMarketplacePages<T extends MarketplaceCatalogItem>(...pages: readonly (readonly T[])[]): T[] {
  const byId = new Map<string, { item: T; order: number }>();
  let order = 0;
  for (const page of pages) for (const item of page) {
    if (!byId.has(item.id)) byId.set(item.id, { item, order });
    order += 1;
  }
  return [...byId.values()].sort((a, b) => timeOf(b.item) - timeOf(a.item) || a.order - b.order).map(({ item }) => item);
}
