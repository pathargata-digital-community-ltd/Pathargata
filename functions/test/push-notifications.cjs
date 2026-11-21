const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildExpoPushMessage,
  collectExpoPushTokens,
  notificationContent,
  shouldSendPush,
} = require("../push-notifications");

test("accepts Expo push tokens and ignores invalid or duplicate entries", () => {
  const tokens = collectExpoPushTokens({
    first: { token: "ExponentPushToken[device-1]" },
    duplicate: "ExponentPushToken[device-1]",
    malformed: { token: "not-a-token" },
    blank: null,
  });

  assert.deepEqual(tokens, [
    { tokenKey: "first", token: "ExponentPushToken[device-1]" },
  ]);
});

test("honors the per-dispatch token cap", () => {
  const tokens = collectExpoPushTokens(
    Object.fromEntries(
      Array.from({ length: 3 }, (_, index) => [
        `token-${index}`,
        `ExponentPushToken[device-${index}]`,
      ]),
    ),
    2,
  );
  assert.equal(tokens.length, 2);
});

test("does not send push for pending, unsent, or self-authored notifications", () => {
  assert.equal(
    shouldSendPush({ type: "comment", status: "pending" }, "u1"),
    false,
  );
  assert.equal(shouldSendPush({ type: "comment", sent: false }, "u1"), false);
  assert.equal(shouldSendPush({ type: "like", fromUid: "u1" }, "u1"), false);
  assert.equal(shouldSendPush({ type: "like", fromUid: "u2" }, "u1"), true);
});

test("respects master and category push preferences", () => {
  assert.equal(shouldSendPush({ type: "like", fromUid: "u2" }, "u1", { masterPush: false }), false);
  assert.equal(shouldSendPush({ type: "chat", fromUid: "u2" }, "u1", { messageAlert: false }), false);
  assert.equal(shouldSendPush({ type: "comment", fromUid: "u2" }, "u1", { postAlert: false }), false);
  assert.equal(shouldSendPush({ type: "blood_req", fromUid: "u2" }, "u1", { bloodAlert: false }), false);
  assert.equal(shouldSendPush({ type: "market_update", fromUid: "u2" }, "u1", { marketAlert: false }), false);
  assert.equal(shouldSendPush({ type: "referral_bonus", fromUid: "u2" }, "u1", { postAlert: false }), true);
  assert.equal(shouldSendPush({ type: "like", fromUid: "u2" }, "u1"), true);
});

test("formats a comment notification and preserves navigation data", () => {
  const message = buildExpoPushMessage(
    "ExponentPushToken[device-1]",
    {
      type: "comment",
      fromUid: "author-2",
      fromName: "রাহিম",
      postId: "post-42",
    },
    "notification-7",
  );

  assert.equal(message.to, "ExponentPushToken[device-1]");
  assert.equal(message.title, "নতুন মন্তব্য");
  assert.equal(message.body, "রাহিম আপনার পোস্টে মন্তব্য করেছেন");
  assert.equal(message.channelId, "default");
  assert.deepEqual(message.data, {
    notificationId: "notification-7",
    type: "comment",
    postId: "post-42",
    fromUid: "author-2",
    fromName: "রাহিম",
  });
});

test("formats a post-tag notification and preserves a blood-request deep link", () => {
  assert.deepEqual(notificationContent({ type: "post_tag", fromName: "রাহিম" }), {
    title: "পোস্টে উল্লেখ",
    body: "রাহিম আপনাকে পোস্টে উল্লেখ করেছেন",
  });
  const message = buildExpoPushMessage(
    "ExponentPushToken[device-2]",
    { type: "blood_req", bloodRequestId: "request-42", group: "B+" },
    "notification-8",
  );
  assert.equal(message.data.bloodRequestId, "request-42");
  assert.equal(message.data.group, "B+");
});

test("uses a safe generic message for unknown notification types", () => {
  assert.deepEqual(notificationContent({ type: "new_feature" }), {
    title: "পাথরঘাটা ডিজিটাল",
    body: "আপনার জন্য নতুন নোটিফিকেশন এসেছে",
  });
});
