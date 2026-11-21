const EXPO_PUSH_TOKEN_PATTERN = /^(?:Exponent|Expo)PushToken\[[^\]]+\]$/;
const NON_SENDABLE_STATUSES = new Set(["pending", "unsent", "queued"]);
const PREFERENCE_BY_NOTIFICATION_TYPE = {
  blood_req: "bloodAlert",
  market_update: "marketAlert",
  chat: "messageAlert",
  like: "postAlert",
  comment: "postAlert",
  reply: "postAlert",
  post_tag: "postAlert",
  repost: "postAlert",
  market_order: "marketAlert",
  market_order_update: "marketAlert",
};

function shouldSendPush(notification, recipientUid, preferences = {}) {
  if (!notification || typeof notification !== "object") return false;
  if (notification.sent === false) return false;

  const status = String(
    notification.status || notification.deliveryStatus || "",
  ).toLowerCase();
  if (NON_SENDABLE_STATUSES.has(status)) return false;
  if (
    notification.fromUid &&
    String(notification.fromUid) === String(recipientUid)
  ) {
    return false;
  }
  if (preferences.masterPush === false) return false;
  const categoryPreference = PREFERENCE_BY_NOTIFICATION_TYPE[notification.type];
  if (categoryPreference && preferences[categoryPreference] === false) {
    return false;
  }
  return true;
}

function collectExpoPushTokens(rawTokens, maxTokens = Number.POSITIVE_INFINITY) {
  if (!rawTokens || typeof rawTokens !== "object") return [];
  const seen = new Set();
  const tokens = [];

  for (const [tokenKey, value] of Object.entries(rawTokens)) {
    const token = typeof value === "string" ? value : value?.token;
    if (typeof token !== "string" || !EXPO_PUSH_TOKEN_PATTERN.test(token)) {
      continue;
    }
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push({ tokenKey, token });
    if (tokens.length >= maxTokens) break;
  }
  return tokens;
}

function notificationContent(notification) {
  const fromName =
    typeof notification.fromName === "string" && notification.fromName.trim()
      ? notification.fromName.trim()
      : "একজন ব্যবহারকারী";

  switch (notification.type) {
    case "like":
      return {
        title: "নতুন লাইক",
        body: `${fromName} আপনার পোস্টে লাইক দিয়েছেন`,
      };
    case "comment":
      return {
        title: "নতুন মন্তব্য",
        body: `${fromName} আপনার পোস্টে মন্তব্য করেছেন`,
      };
    case "reply":
      return {
        title: "নতুন উত্তর",
        body: `${fromName} আপনার মন্তব্যের উত্তর দিয়েছেন`,
      };
    case "chat":
      return { title: "নতুন মেসেজ", body: `${fromName} আপনাকে মেসেজ করেছেন` };
    case "post_tag":
      return {
        title: "পোস্টে উল্লেখ",
        body: `${fromName} আপনাকে পোস্টে উল্লেখ করেছেন`,
      };
    case "repost":
      return {
        title: "নতুন রিপোস্ট",
        body: `${fromName} আপনার পোস্ট রিপোস্ট করেছেন`,
      };
    case "market_order":
      return {
        title: "নতুন পণ্যের অর্ডার",
        body: `${fromName} আপনার ${notification.productTitle || "পণ্যে"} অর্ডার করেছেন`,
      };
    case "market_order_update":
      return {
        title: "অর্ডার আপডেট",
        body: `আপনার অর্ডার ${notification.marketOrderStatus || "আপডেট"}`,
      };
    case "blood_req":
      return {
        title: "জরুরি রক্তের অনুরোধ",
        body: notification.group
          ? `রক্তের গ্রুপ: ${String(notification.group)}`
          : "একটি জরুরি রক্তের অনুরোধ এসেছে",
      };
    case "referral_bonus":
      return {
        title: "রেফারেল বোনাস",
        body: "আপনার অ্যাকাউন্টে নতুন বোনাস এসেছে",
      };
    default:
      return {
        title: "পাথরঘাটা ডিজিটাল",
        body: "আপনার জন্য নতুন নোটিফিকেশন এসেছে",
      };
  }
}

function buildExpoPushMessage(token, notification, notificationId) {
  const { title, body } = notificationContent(notification);
  const data = {
    notificationId: String(notificationId),
    type: String(notification.type || "general"),
  };
  for (const key of [
    "postId",
    "fromUid",
    "fromName",
    "group",
    "bloodRequestId",
    "requestId",
    "orderId",
    "productTitle",
    "marketOrderStatus",
  ]) {
    if (notification[key] !== undefined && notification[key] !== null) {
      data[key] = String(notification[key]);
    }
  }

  return {
    to: token,
    title,
    body,
    sound: "default",
    priority: "high",
    channelId: "default",
    ttl: 86400,
    data,
  };
}

module.exports = {
  EXPO_PUSH_TOKEN_PATTERN,
  buildExpoPushMessage,
  collectExpoPushTokens,
  notificationContent,
  shouldSendPush,
};
