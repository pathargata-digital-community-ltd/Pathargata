const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FIVE_DAYS_MS,
  getNotificationExpiryAt,
  shouldExpireNotification,
} = require("../notification-expiration");

test("expires a sent notification once its send timestamp reaches five days", () => {
  const now = 10 * FIVE_DAYS_MS;
  const cutoff = now - FIVE_DAYS_MS;
  assert.equal(
    shouldExpireNotification({ timestamp: cutoff, read: false }, cutoff),
    true,
  );
  assert.equal(shouldExpireNotification({ sentAt: cutoff - 1 }, cutoff), true);
});

test("keeps recent notifications and notifications without a sent timestamp", () => {
  const cutoff = 1000;
  assert.equal(
    shouldExpireNotification({ timestamp: cutoff + 1 }, cutoff),
    false,
  );
  assert.equal(
    shouldExpireNotification({ type: "comment", read: false }, cutoff),
    false,
  );
  assert.equal(shouldExpireNotification({ timestamp: "900" }, cutoff), false);
});

test("keeps explicitly unsent or pending notification records", () => {
  const cutoff = 1000;
  assert.equal(
    shouldExpireNotification({ timestamp: 1, sent: false }, cutoff),
    false,
  );
  assert.equal(
    shouldExpireNotification({ timestamp: 1, status: "Pending" }, cutoff),
    false,
  );
  assert.equal(
    shouldExpireNotification(
      { timestamp: 1, deliveryStatus: "unsent" },
      cutoff,
    ),
    false,
  );
});

test("creates a queue deadline only for sent notifications", () => {
  assert.equal(
    getNotificationExpiryAt({ timestamp: 1000 }),
    1000 + FIVE_DAYS_MS,
  );
  assert.equal(
    getNotificationExpiryAt({ timestamp: 1000, status: "pending" }),
    null,
  );
  assert.equal(getNotificationExpiryAt({ timestamp: 1000, sent: false }), null);
});
