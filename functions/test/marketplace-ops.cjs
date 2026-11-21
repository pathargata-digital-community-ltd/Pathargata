const test = require("node:test");
const assert = require("node:assert/strict");
const {
  anonymousId,
  buildMarketplaceMetric,
  buildSafeOrderLog,
  normalizeEventType,
  utcDay,
} = require("../marketplace-ops");

test("marketplace metrics use stable anonymous identifiers", () => {
  assert.equal(anonymousId("user-a"), anonymousId("user-a"));
  assert.notEqual(anonymousId("user-a"), "user-a");
  const log = buildSafeOrderLog({ id: "order-1", buyerUid: "buyer", sellerUid: "seller", fulfillmentStatus: "pending" }, "order_created");
  assert.deepEqual(Object.keys(log).sort(), ["buyer", "eventType", "orderId", "seller", "status"]);
  assert.equal(log.status, "pending");
});

test("marketplace metrics allowlist event types and use UTC day buckets", () => {
  assert.equal(normalizeEventType("checkout_success"), "checkout_success");
  assert.equal(normalizeEventType("raw_uid_event"), "unknown");
  const timestamp = Date.parse("2026-01-02T03:04:05.000Z");
  assert.equal(utcDay(timestamp), "2026-01-02");
  assert.deepEqual(buildMarketplaceMetric("stock_conflict", timestamp), {
    eventType: "stock_conflict",
    day: "2026-01-02",
    lastAt: timestamp,
  });
});
