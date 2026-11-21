const crypto = require("node:crypto");

const MARKETPLACE_EVENT_TYPES = new Set([
  "checkout_success",
  "checkout_failed",
  "checkout_rate_limited",
  "checkout_disabled",
  "stock_conflict",
  "duplicate_request",
  "order_created",
  "order_status_changed",
  "order_cancelled",
  "notification_created",
  "notification_failed",
]);

function anonymousId(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 16);
}

function utcDay(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeEventType(value) {
  const eventType = String(value || "");
  return MARKETPLACE_EVENT_TYPES.has(eventType) ? eventType : "unknown";
}

function buildMarketplaceMetric(eventType, timestamp = Date.now()) {
  return {
    eventType: normalizeEventType(eventType),
    day: utcDay(timestamp),
    lastAt: timestamp,
  };
}

function buildSafeOrderLog(order, eventType) {
  return {
    eventType: normalizeEventType(eventType),
    orderId: anonymousId(order?.id || order?.orderId),
    buyer: anonymousId(order?.buyerUid),
    seller: anonymousId(order?.sellerUid),
    status: String(order?.fulfillmentStatus || order?.status || "unknown").slice(0, 32),
  };
}

module.exports = {
  MARKETPLACE_EVENT_TYPES,
  anonymousId,
  utcDay,
  normalizeEventType,
  buildMarketplaceMetric,
  buildSafeOrderLog,
};
