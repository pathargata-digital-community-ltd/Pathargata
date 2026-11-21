import type { MarketProductRecord } from "@/hooks/use-marketplace-catalog";

export type MarketplaceCartItem = {
  product: MarketProductRecord;
  quantity: number;
};

export const MAX_MARKETPLACE_CART_ITEMS = 50;

function asText(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function asImages(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 8);
  if (typeof value === "string" && value) return [value];
  return [];
}

function parseProduct(value: unknown): MarketProductRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = asText(raw.id);
  const title = asText(raw.title);
  const price = asText(raw.price);
  const seller = asText(raw.seller);
  if (!id || !title || !price || !seller) return null;
  const stock = raw.stock === undefined || raw.stock === null ? undefined : Number(raw.stock);
  return {
    id,
    uid: asText(raw.uid),
    shopId: asText(raw.shopId),
    title,
    name: asText(raw.name) || title,
    price,
    category: asText(raw.category),
    desc: asText(raw.desc),
    description: asText(raw.description),
    seller,
    image: asText(raw.image),
    images: asImages(raw.images || raw.image),
    stock: Number.isFinite(stock) ? stock : undefined,
    availability: asText(raw.availability),
    time: Number.isFinite(Number(raw.time)) ? Number(raw.time) : 0,
    address: asText(raw.address),
    union: asText(raw.union),
    village: asText(raw.village),
  };
}

export function parseMarketplaceCart(raw: string | null): MarketplaceCartItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_MARKETPLACE_CART_ITEMS).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const product = parseProduct(item.product);
      const quantity = Math.floor(Number(item.quantity));
      if (!product || !Number.isFinite(quantity) || quantity < 1) return [];
      const cappedQuantity = typeof product.stock === "number" && product.stock >= 0
        ? Math.min(quantity, Math.floor(product.stock))
        : quantity;
      return cappedQuantity > 0 ? [{ product, quantity: cappedQuantity }] : [];
    });
  } catch {
    return [];
  }
}

export function serializeMarketplaceCart(items: MarketplaceCartItem[]): string {
  return JSON.stringify(items.slice(0, MAX_MARKETPLACE_CART_ITEMS).map(({ product, quantity }) => ({
    product,
    quantity: Math.max(1, Math.floor(quantity)),
  })));
}
