import { describe, expect, it } from "vitest";
import {
  buildMarketplaceOrderPayload,
  canTransitionMarketplaceOrder,
  getMarketplaceOrderStatusLabel,
  normalizeMarketplaceOrder,
} from "../lib/market-orders";

const orderInput = {
  productId: "product-1",
  productTitle: "মধু",
  productPrice: "500",
  productImage: "https://example.com/honey.jpg",
  sellerUid: "seller-1",
  sellerName: "দোকানদার",
  buyerUid: "buyer-1",
  buyerName: "ক্রেতা",
  buyerPhone: "01700000000",
  buyerAddress: "পাথরঘাটা বাজার",
  quantity: 2,
};

describe("marketplace order schema", () => {
  it("writes Web-compatible fields, trims required values, and defaults metadata", () => {
    expect(buildMarketplaceOrderPayload({
      ...orderInput, buyerName: " ক্রেতা ", buyerAddress: " ঠিকানা ", buyerPhone: " 01700000000 ",
    }, 4321)).toEqual({
      ...orderInput,
      buyerName: "ক্রেতা",
      buyerPhone: "01700000000",
      buyerAddress: "ঠিকানা",
      status: "pending",
      fulfillmentStatus: "pending",
      time: 4321,
      deliveryMethod: "delivery",
      paymentMethod: "cash_on_delivery",
    });
  });

  it.each([
    ["+8801700000000", "01700000000"],
    ["8801700000000", "01700000000"],
    ["01700000000", "01700000000"],
  ])("normalizes valid Bangladesh mobile %s", (phone, expected) => {
    expect(buildMarketplaceOrderPayload({ ...orderInput, buyerPhone: phone }).buyerPhone).toBe(expected);
  });

  it.each(["01200000000", "0170000000", "+880170000000", "12345678901", "0170000000x"])(
    "rejects invalid Bangladesh mobile %s", (buyerPhone) => {
      expect(() => buildMarketplaceOrderPayload({ ...orderInput, buyerPhone })).toThrow("সঠিক বাংলাদেশি মোবাইল নম্বর দিন।");
    },
  );

  it("reads legacy deliveryAddress/timestamp and defaults legacy metadata", () => {
    expect(normalizeMarketplaceOrder("order-1", {
      ...orderInput,
      buyerAddress: undefined,
      deliveryAddress: "পুরোনো ঠিকানা",
      quantity: undefined,
      status: "Pending",
      timestamp: 4321,
    })).toMatchObject({
      id: "order-1", buyerAddress: "পুরোনো ঠিকানা", quantity: 1, status: "pending", fulfillmentStatus: "pending", time: 4321,
      deliveryMethod: "delivery", paymentMethod: "cash_on_delivery",
    });
  });

  it("supports optional pickup metadata and history", () => {
    const history = [{ status: "pending" as const, time: 123, byUid: "buyer-1" }];
    expect(buildMarketplaceOrderPayload({
      ...orderInput, deliveryMethod: "pickup", paymentMethod: "pay_on_pickup", statusHistory: history,
    })).toMatchObject({ deliveryMethod: "pickup", paymentMethod: "pay_on_pickup", statusHistory: history });
  });

  it("reads Native fulfillment progress while preserving Web pending, and lets Web terminal states win", () => {
    expect(normalizeMarketplaceOrder("order-2", { status: "pending", fulfillmentStatus: "preparing" })).toMatchObject({ status: "preparing" });
    expect(normalizeMarketplaceOrder("order-3", { status: "delivered", fulfillmentStatus: "shipped" })).toMatchObject({ status: "delivered" });
  });

  it("normalizes status history stored as a keyed Realtime Database object", () => {
    expect(normalizeMarketplaceOrder("order-4", {
      status: "pending",
      statusHistory: { "-entry": { status: "accepted", time: 123, byUid: "seller-1" } },
    }).statusHistory).toEqual([{ status: "accepted", time: 123, byUid: "seller-1" }]);
  });

  it("rejects missing identity/address and invalid quantity", () => {
    expect(() => buildMarketplaceOrderPayload({ ...orderInput, sellerUid: "" })).toThrow("ক্রেতা ও বিক্রেতার account শনাক্ত করা যায়নি।");
    expect(() => buildMarketplaceOrderPayload({ ...orderInput, buyerAddress: " " })).toThrow("নাম, ফোন এবং ডেলিভারি ঠিকানা দিন।");
    expect(() => buildMarketplaceOrderPayload({ ...orderInput, quantity: 0 })).toThrow("পণ্যের সঠিক পরিমাণ দিন।");
  });
});

describe("marketplace status transitions", () => {
  it.each([
    ["pending", "accepted"], ["pending", "cancelled"],
    ["accepted", "preparing"], ["accepted", "cancelled"],
    ["preparing", "shipped"],
    ["shipped", "delivered"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransitionMarketplaceOrder(from, to)).toBe(true);
  });

  it.each([
    ["pending", "preparing"], ["pending", "shipped"], ["pending", "delivered"],
    ["accepted", "pending"], ["accepted", "shipped"], ["accepted", "delivered"],
    ["preparing", "pending"], ["preparing", "accepted"], ["preparing", "cancelled"], ["preparing", "delivered"],
    ["shipped", "pending"], ["shipped", "accepted"], ["shipped", "preparing"], ["shipped", "cancelled"],
    ["delivered", "pending"], ["delivered", "cancelled"], ["cancelled", "pending"], ["cancelled", "accepted"],
    ["pending", "pending"], ["delivered", "delivered"], ["cancelled", "cancelled"],
  ] as const)("blocks %s → %s", (from, to) => {
    expect(canTransitionMarketplaceOrder(from, to)).toBe(false);
  });

  it("provides a Bengali label", () => {
    expect(getMarketplaceOrderStatusLabel("preparing")).toBe("প্রস্তুত করা হচ্ছে");
  });
});
