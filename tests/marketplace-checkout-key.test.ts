import { describe, expect, it } from "vitest";
import { createMarketplaceCheckoutIdempotencyKey } from "../lib/marketplace-checkout-key";

describe("createMarketplaceCheckoutIdempotencyKey", () => {
  it("pads short sanitized React useId values with a valid unique key prefix", () => {
    const key = createMarketplaceCheckoutIdempotencyKey("r0", 1, 1_700_000_000_000);
    expect(key).toMatch(/^[A-Za-z0-9:_-]{8,160}$/);
    expect(key).toContain("r0");
  });

  it("sanitizes instance IDs and bounds the result to the backend maximum", () => {
    const key = createMarketplaceCheckoutIdempotencyKey("::long/id with spaces".repeat(10), 2, 12);
    expect(key).toMatch(/^[A-Za-z0-9:_-]{8,160}$/);
  });

  it("falls back to a valid key for malformed sequence or instance ID", () => {
    const key = createMarketplaceCheckoutIdempotencyKey("***", 0, 0);
    expect(key).toMatch(/^[A-Za-z0-9:_-]{8,160}$/);
    expect(key).toContain("native");
  });
});
