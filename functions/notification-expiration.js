const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function shouldExpireNotification(notification, cutoff) {
  if (
    !notification ||
    typeof notification !== "object" ||
    Array.isArray(notification)
  ) {
    return false;
  }

  const status =
    typeof notification.status === "string"
      ? notification.status.toLowerCase()
      : "";
  const deliveryStatus =
    typeof notification.deliveryStatus === "string"
      ? notification.deliveryStatus.toLowerCase()
      : "";

  // Pending/unsent entries remain in the database until they are sent.
  if (
    notification.sent === false ||
    status === "pending" ||
    status === "unsent" ||
    deliveryStatus === "pending" ||
    deliveryStatus === "unsent"
  ) {
    return false;
  }

  // Existing Pathargata notifications use `timestamp`; `sentAt` is preferred
  // if a future sender provides an explicit delivery timestamp.
  const sentAt =
    typeof notification.sentAt === "number"
      ? notification.sentAt
      : notification.timestamp;

  return Number.isFinite(sentAt) && sentAt > 0 && sentAt <= cutoff;
}

function getNotificationExpiryAt(notification) {
  if (
    !notification ||
    typeof notification !== "object" ||
    Array.isArray(notification) ||
    notification.sent === false
  ) {
    return null;
  }
  const status =
    typeof notification.status === "string"
      ? notification.status.toLowerCase()
      : "";
  const deliveryStatus =
    typeof notification.deliveryStatus === "string"
      ? notification.deliveryStatus.toLowerCase()
      : "";
  if (
    ["pending", "unsent", "queued"].includes(status) ||
    ["pending", "unsent", "queued"].includes(deliveryStatus)
  ) {
    return null;
  }
  const sentAt =
    typeof notification.sentAt === "number"
      ? notification.sentAt
      : notification.timestamp;
  return Number.isFinite(sentAt) && sentAt > 0 ? sentAt + FIVE_DAYS_MS : null;
}

module.exports = {
  FIVE_DAYS_MS,
  getNotificationExpiryAt,
  shouldExpireNotification,
};
