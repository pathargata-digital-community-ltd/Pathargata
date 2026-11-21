const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildServerOrder,
  getProductSnapshot,
  normalizeCheckoutInput,
  normalizeMobile,
  parsePrice,
  parseStock,
} = require("../marketplace-checkout");

const valid = {
  items: [{ productId: "product-1", quantity: 2 }],
  buyerName: "ক্রেতা",
  buyerPhone: "01700000000",
  buyerAddress: "পাথরঘাটা বাজার",
  deliveryMethod: "delivery",
  paymentMethod: "cash_on_delivery",
  idempotencyKey: "checkout-abc-1234",
};

test("normalizes a valid bounded checkout request", () => {
  assert.deepEqual(normalizeCheckoutInput(valid), { ...valid, buyerPhone: "01700000000" });
});

test("does not accept a client-supplied buyer UID", () => {
  const normalized = normalizeCheckoutInput({ ...valid, buyerUid: "victim-uid" });
  assert.equal("buyerUid" in normalized, false);
});

test("rejects invalid quantity, duplicate items, and excessive item count", () => {
  assert.throws(() => normalizeCheckoutInput({ ...valid, items: [{ productId: "product-1", quantity: 0 }] }));
  assert.throws(() => normalizeCheckoutInput({ ...valid, items: [{ productId: "product-1", quantity: 1 }, { productId: "product-1", quantity: 1 }] }));
  assert.throws(() => normalizeCheckoutInput({ ...valid, items: Array.from({ length: 21 }, (_, index) => ({ productId: `p-${index}`, quantity: 1 })) }));
});

test("rejects invalid price and stock values", () => {
  assert.equal(parsePrice("not-a-price"), null);
  assert.equal(parsePrice("0"), null);
  assert.equal(parseStock(-1), undefined);
  assert.equal(parseStock(""), null);
});

test("normalizes Bangladesh phone numbers", () => {
  assert.equal(normalizeMobile("+880 1700000000"), "01700000000");
  assert.equal(normalizeMobile("01200000000"), "");
});

test("builds a server-owned immutable order snapshot from current product data", () => {
  const item = getProductSnapshot("product-1", {
    uid: "seller-1",
    shopId: "shop-1",
    title: "Fresh honey",
    price: "500",
    stock: 8,
    availability: "available",
    image: "https://example.com/honey.jpg",
  }, { uid: "seller-1" }, { uid: "seller-1", name: "Seller", status: "user", __buyerUid: "buyer-1" });
  const order = buildServerOrder({
    orderId: "order-1",
    orderGroupId: "group-1",
    buyerUid: "buyer-1",
    buyer: { buyerName: "Buyer", buyerPhone: "01700000000", buyerAddress: "Address", deliveryMethod: "delivery", paymentMethod: "cash_on_delivery", idempotencyKey: "checkout-abc-1234" },
    item: { ...item, quantity: 2 },
    timestamp: 123,
  });
  assert.equal(order.productPrice, "500");
  assert.equal(order.totalPrice, 1000);
  assert.equal(order.buyerUid, "buyer-1");
  assert.equal(order.status, "pending");
  assert.equal(order.source, "server_checkout");
});

test("rejects a seller buying their own product", () => {
  assert.throws(() => getProductSnapshot("product-1", { uid: "seller-1", shopId: "shop-1", title: "Item", price: 100, stock: 4 }, { uid: "seller-1" }, { uid: "seller-1", status: "user", __buyerUid: "seller-1" }), /নিজের পণ্যে/);
});
