import { describe, expect, it } from "vitest";
import { parseMarketplaceCart, serializeMarketplaceCart } from "../lib/marketplace-cart";

const product = {
  id: "p1",
  title: "মধু",
  price: "৳ ৫০০",
  seller: "স্থানীয় দোকান",
  images: ["https://example.com/honey.jpg"],
  stock: 3,
  time: 10,
};

describe("marketplace cart persistence", () => {
  it("round-trips a bounded cart and caps quantity at stored stock", () => {
    const parsed = parseMarketplaceCart(serializeMarketplaceCart([{ product, quantity: 7 }]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ product: { id: "p1" }, quantity: 3 });
  });

  it("drops malformed entries and invalid JSON safely", () => {
    expect(parseMarketplaceCart("not-json")).toEqual([]);
    expect(parseMarketplaceCart(JSON.stringify([
      null,
      { product: { id: "missing-fields" }, quantity: 1 },
      { product, quantity: 0 },
    ]))).toEqual([]);
  });

  it("does not expose arbitrary stored product fields", () => {
    const parsed = parseMarketplaceCart(JSON.stringify([{ product: { ...product, ownerUid: "secret", email: "private@example.com" }, quantity: 1 }]));
    expect(parsed[0].product).not.toHaveProperty("ownerUid");
    expect(parsed[0].product).not.toHaveProperty("email");
  });
});
