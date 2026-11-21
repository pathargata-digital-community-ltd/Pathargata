import { describe, expect, it } from "vitest";
import {
  filterMarketplaceCatalog,
  compareMarketplaceRtdbKeys,
  getMarketplacePageCursor,
  getMarketplaceCategoryOptions,
  mergeMarketplacePages,
  normalizeMarketplaceText,
  parseTakaPrice,
  sortMarketplaceCatalog,
  type MarketplaceCatalogItem,
} from "../lib/marketplace-catalog";

const rows: MarketplaceCatalogItem[] = [
  { id: "a", name: "Fresh Mango", category: "Fruit", price: "৳ ১,২০০", time: 10, union: "North Ward" },
  { id: "b", name: "Rice bag", category: "Grocery", price: "1,500.50 Taka", time: 30, stock: 0, village: "South" },
  { id: "c", title: "Mango pickle", category: "Fruit", price: "৳ ২৫০", time: 20, availability: "unavailable" },
  { id: "d", name: "Tea", category: "Grocery", price: "৳ ৮০০", time: 20 },
];

describe("marketplace catalog", () => {
  it("parses Bengali and Latin amounts, separators, currency text, and rejects invalid values", () => {
    expect(parseTakaPrice("৳ ১,২৩,৪৫৬.৫০ টাকা")).toBe(123456.5);
    expect(parseTakaPrice("BDT 12,345 টাকা")).toBe(12345);
    expect(parseTakaPrice(" ৪৫৬ ")).toBe(456);
    expect(parseTakaPrice("free")).toBeNull();
    expect(parseTakaPrice(-10)).toBeNull();
    expect(parseTakaPrice(null)).toBeNull();
  });

  it("normalizes case, unicode compatibility and whitespace", () => {
    expect(normalizeMarketplaceText("  ＦＲＥＳＨ\u200b   Mango ")).toBe("fresh mango");
  });

  it("filters by normalized search, category, price range, locality and availability", () => {
    expect(filterMarketplaceCatalog(rows, { search: "MANGO" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterMarketplaceCatalog(rows, { category: " fruit " }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterMarketplaceCatalog(rows, { minPrice: 800, maxPrice: 1200 }).map((r) => r.id)).toEqual(["a", "d"]);
    expect(filterMarketplaceCatalog(rows, { locality: "north" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterMarketplaceCatalog(rows, { availability: "available" }).map((r) => r.id)).toEqual(["a", "d"]);
    expect(filterMarketplaceCatalog(rows, { availability: "unavailable" }).map((r) => r.id)).toEqual(["b", "c"]);
    expect(filterMarketplaceCatalog(rows, { availability: "all" })).toHaveLength(4);
  });

  it("treats missing stock or availability as available, and excludes unknown prices for bounds", () => {
    const legacy: MarketplaceCatalogItem[] = [{ id: "legacy", category: "Old", time: 1 }, { id: "zero", price: "0", stock: 0 }];
    expect(filterMarketplaceCatalog(legacy, { availability: "available" })).toEqual([legacy[0]]);
    expect(filterMarketplaceCatalog(legacy, { minPrice: 1 })).toEqual([]);
  });

  it("sorts newest and prices with stable ties and unpriced rows last", () => {
    expect(sortMarketplaceCatalog(rows).map((r) => r.id)).toEqual(["b", "c", "d", "a"]);
    expect(sortMarketplaceCatalog(rows, "price-low").map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
    expect(sortMarketplaceCatalog(rows, "price-high").map((r) => r.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("derives unique categories only from available items", () => {
    expect(getMarketplaceCategoryOptions(rows)).toEqual(["Fruit", "Grocery"]);
    expect(getMarketplaceCategoryOptions([{ id: "x", category: "Fruit" }, { id: "y", category: " fruit " }])).toEqual(["Fruit"]);
  });

  it("merges pages stably by id, first occurrence wins, newest first", () => {
    const first = [{ id: "x", name: "original", time: 5 }, { id: "y", time: 20 }];
    const second = [{ id: "x", name: "duplicate", time: 99 }, { id: "z", time: 20 }];
    expect(mergeMarketplacePages(first, second)).toEqual([first[1], second[1], first[0]]);
    expect(mergeMarketplacePages()).toEqual([]);
  });

  it("uses the smallest key as a stable cursor when multiple items share the oldest timestamp", () => {
    expect(getMarketplacePageCursor([{ id: "c", time: 4 }, { id: "a", time: 4 }, { id: "z", time: 5 }])).toEqual({ id: "a", time: 4 });
    expect(compareMarketplaceRtdbKeys("11", "2")).toBeGreaterThan(0);
    expect(compareMarketplaceRtdbKeys("2", "push-id")).toBeLessThan(0);
    expect(getMarketplacePageCursor([])).toBeNull();
  });
});
