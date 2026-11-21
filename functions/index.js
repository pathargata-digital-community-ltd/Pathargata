const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { logger } = require("firebase-functions");
const { onValueCreated } = require("firebase-functions/database");
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  buildExpoPushMessage,
  collectExpoPushTokens,
  shouldSendPush,
} = require("./push-notifications");
const {
  getNotificationExpiryAt,
} = require("./notification-expiration");
const { buildPublicUserIndex } = require("./public-user-index");
const { aiAssistant, createBloodRequest, acceptMarketplaceOrder } = require("./ai-assistant");
const {
  IDEMPOTENCY_TTL_MS,
  buildServerOrder,
  getProductSnapshot,
  normalizeCheckoutInput,
  parseStock,
} = require("./marketplace-checkout");
const {
  canTransition: canTransitionMarketplaceOrder,
  deriveGroupStatus,
  isKnownStatus,
  normalizeStatus,
} = require("./marketplace-lifecycle");
const {
  buildMarketplaceMetric,
  buildSafeOrderLog,
} = require("./marketplace-ops");
const {
  requestSuperAdminChange,
  decideSuperAdminApproval,
  requestSuperAdminRollback,
} = require("./admin-controls");
const { purgeUserAccount, purgeTrashPost, restoreTrashPost } = require("./media-purge");

const projectId = "pathargata-digital-comnity-ltd";
const functionRegion = "us-central1";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const PUSH_BATCH_SIZE = 100;
const MAX_PUSH_TOKENS_PER_NOTIFICATION = 500;
const MAX_DISPATCH_ATTEMPTS = 5;
const PUSH_RETRY_QUEUE = "pushDispatchQueue";
const PUSH_RETRY_BATCH_SIZE = 100;
const PUSH_RETRY_TIME_BUDGET_MS = 45 * 1000;
const RECEIPT_BATCH_SIZE = 1000;
const RECEIPT_SCAN_BATCH_SIZE = 1000;
const RECEIPT_MIN_AGE_MS = 15 * 60 * 1000;
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECEIPT_MAX_ATTEMPTS = 5;
const DELETE_BATCH_SIZE = 500;
const NOTIFICATION_MAX_ATTEMPTS = 5;
const MAINTENANCE_TIME_BUDGET_MS = 45 * 1000;
const QUEUE_LEASE_MS = 5 * 60 * 1000;
const NOTIFICATION_EXPIRY_QUEUE = "notificationExpiryQueue";
const MAINTENANCE_STATE = "maintenanceState";
const DEAD_LETTER_ROOT = "maintenanceDeadLetters";

function boundedErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message.replace(/[\r\n]/g, " ").slice(0, 240);
}

async function recordMarketplaceMetric(eventType, order, timestamp = Date.now()) {
  const metric = buildMarketplaceMetric(eventType, timestamp);
  await getDatabase()
    .ref(`marketplace_metrics/${metric.day}/${metric.eventType}`)
    .transaction((current) => ({
      count: (Number(current?.count) || 0) + 1,
      lastAt: metric.lastAt,
    }));
  logger.info("Marketplace operational event.", buildSafeOrderLog(order, metric.eventType));
}

function retryDelayMs(attempt) {
  return Math.min(60 * 60 * 1000, 30 * 1000 * 2 ** Math.max(0, attempt - 1));
}

function maintenanceDeadline() {
  return Date.now() + MAINTENANCE_TIME_BUDGET_MS;
}

function pushRetryDeadline() {
  return Date.now() + PUSH_RETRY_TIME_BUDGET_MS;
}

function canonicalChatId(firstUid, secondUid) {
  return firstUid < secondUid
    ? `${firstUid}_${secondUid}`
    : `${secondUid}_${firstUid}`;
}

initializeApp({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
});

exports.aiAssistant = aiAssistant;
exports.createBloodRequest = createBloodRequest;
exports.acceptMarketplaceOrder = acceptMarketplaceOrder;
exports.requestSuperAdminChange = requestSuperAdminChange;
exports.decideSuperAdminApproval = decideSuperAdminApproval;
exports.requestSuperAdminRollback = requestSuperAdminRollback;
exports.purgeUserAccount = purgeUserAccount;
exports.purgeTrashPost = purgeTrashPost;
exports.restoreTrashPost = restoreTrashPost;

exports.createMarketplaceCheckout = onCall(
  {
    region: functionRegion,
    maxInstances: 20,
    concurrency: 10,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const buyerUid = request.auth?.uid;
    if (!buyerUid) throw new HttpsError("unauthenticated", "Login করে checkout করুন।");
    let checkout;
    try {
      checkout = normalizeCheckoutInput(request.data);
    } catch (error) {
      throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Checkout তথ্য সঠিক নয়।");
    }

    const database = getDatabase();
    const now = Date.now();
    const controlsSnapshot = await database.ref("marketplace_controls/checkoutEnabled").get();
    if (controlsSnapshot.val() === false) {
      void recordMarketplaceMetric("checkout_disabled", { buyerUid }).catch(() => undefined);
      throw new HttpsError("failed-precondition", "Marketplace checkout সাময়িকভাবে বন্ধ আছে। পরে আবার চেষ্টা করুন।");
    }
    const idempotencyRef = database.ref(`market_checkout_idempotency/${buyerUid}/${checkout.idempotencyKey}`);
    let existingClaimSeen = false;
    const claimResult = await idempotencyRef.transaction((current) => {
      if (current && Number(current.expiresAt) > now) {
        existingClaimSeen = true;
        return current;
      }
      return { status: "pending", createdAt: now, expiresAt: now + IDEMPOTENCY_TTL_MS };
    });
    const existingClaim = claimResult.snapshot.val();
    if (existingClaimSeen) {
      void recordMarketplaceMetric("duplicate_request", { buyerUid }).catch(() => undefined);
      if (existingClaim?.status === "completed" && Array.isArray(existingClaim.orderIds)) {
        return { orderIds: existingClaim.orderIds, orderGroupId: existingClaim.orderGroupId, alreadyApplied: true };
      }
      throw new HttpsError("aborted", "এই checkout request ইতিমধ্যে প্রক্রিয়াধীন। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
    }
    const rateRef = database.ref(`market_checkout_rate/${buyerUid}/${Math.floor(now / 60_000)}`);
    const rateClaim = await rateRef.transaction((current) => {
      const count = Number(current) || 0;
      return count >= 10 ? undefined : count + 1;
    });
    if (!rateClaim.committed) {
      await idempotencyRef.remove().catch(() => undefined);
      void recordMarketplaceMetric("checkout_rate_limited", { buyerUid }).catch(() => undefined);
      throw new HttpsError("resource-exhausted", "অল্প সময়ে অনেক checkout request হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।");
    }

    const reservations = [];
    try {
      const itemSnapshots = await Promise.all(checkout.items.map(async ({ productId, quantity }) => {
        const productSnapshot = await database.ref(`market_items/${productId}`).get();
        const product = productSnapshot.val();
        const shopId = product?.shopId;
        const [shopSnapshot, sellerSnapshot] = await Promise.all([
          shopId ? database.ref(`market_shops/${shopId}`).get() : Promise.resolve(null),
          product?.uid ? database.ref(`users/${product.uid}`).get() : Promise.resolve(null),
        ]);
        const seller = sellerSnapshot?.val() || null;
        if (seller) seller.__buyerUid = buyerUid;
        return { productId, quantity, product, shop: shopSnapshot?.val(), seller };
      }));
      let items;
      try {
        items = itemSnapshots.map(({ productId, quantity, product, shop, seller }) => ({
          ...getProductSnapshot(productId, product, shop, seller),
          quantity,
        }));
      } catch (error) {
        throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "পণ্যের তথ্য যাচাই করা যায়নি।");
      }
      const orderGroupId = database.ref("market_order_groups").push().key;
      if (!orderGroupId) throw new HttpsError("internal", "Order group তৈরি করা যায়নি।");

      for (const item of items) {
        if (!item.stockManaged) continue;
        const productRef = database.ref(`market_items/${item.productId}`);
        const transaction = await productRef.transaction((current) => {
          if (!current) return;
          const stock = parseStock(current.stock);
          const availability = String(current.availability || "available").toLowerCase();
          if (stock === null || stock < item.quantity || availability === "unavailable" || availability === "paused") return;
          const nextStock = stock - item.quantity;
          return {
            ...current,
            stock: nextStock,
            availability: nextStock === 0 ? "unavailable" : current.availability || "available",
            updatedAt: now,
            stockReservationVersion: (Number(current.stockReservationVersion) || 0) + 1,
          };
        });
        if (!transaction.committed) throw new HttpsError("failed-precondition", `${item.productTitle} পর্যাপ্ত stock নেই।`);
        const reserved = transaction.snapshot.val();
        reservations.push({
          productId: item.productId,
          previousStock: item.stock,
          previousAvailability: item.availability,
          nextStock: reserved.stock,
          reservationVersion: reserved.stockReservationVersion,
        });
      }

      const orderIds = items.map(() => database.ref("market_orders").push().key);
      if (orderIds.some((id) => !id)) throw new HttpsError("internal", "Order ID তৈরি করা যায়নি।");
      const updates = {};
      const buyer = {
        buyerName: checkout.buyerName,
        buyerPhone: checkout.buyerPhone,
        buyerAddress: checkout.buyerAddress,
        deliveryMethod: checkout.deliveryMethod,
        paymentMethod: checkout.paymentMethod,
        idempotencyKey: checkout.idempotencyKey,
      };
      items.forEach((item, index) => {
        updates[`market_orders/${orderIds[index]}`] = buildServerOrder({
          orderId: orderIds[index], orderGroupId, buyerUid, buyer, item: { ...item, quantity: item.quantity }, timestamp: now,
        });
      });
      updates[`market_order_groups/${orderGroupId}`] = {
        buyerUid,
        orderIds,
        itemCount: items.reduce((total, item) => total + item.quantity, 0),
        sellerCount: new Set(items.map((item) => item.sellerUid)).size,
        totalPrice: items.reduce((total, item) => total + item.price * item.quantity, 0),
        status: "pending",
        time: now,
        createdAt: now,
      };
      updates[`market_checkout_idempotency/${buyerUid}/${checkout.idempotencyKey}`] = {
        status: "completed",
        orderIds,
        orderGroupId,
        createdAt: now,
        expiresAt: now + IDEMPOTENCY_TTL_MS,
      };
      await database.ref().update(updates);
      void recordMarketplaceMetric("checkout_success", { buyerUid, orderId: orderIds[0] }).catch(() => undefined);
      void recordMarketplaceMetric("order_created", { buyerUid, orderId: orderIds[0] }).catch(() => undefined);
      return { orderIds, orderGroupId, alreadyApplied: false };
    } catch (error) {
      for (const reservation of reservations.reverse()) {
        await database.ref(`market_items/${reservation.productId}`).transaction((current) => {
          if (!current) return;
          const currentVersion = Number(current.stockReservationVersion) || 0;
          if (currentVersion !== reservation.reservationVersion || Number(current.stock) !== Number(reservation.nextStock)) return current;
          return {
            ...current,
            stock: reservation.previousStock,
            availability: reservation.previousAvailability || "available",
            updatedAt: Date.now(),
            stockReservationVersion: currentVersion + 1,
          };
        }).catch(() => undefined);
      }
      await idempotencyRef.remove().catch(() => undefined);
      void recordMarketplaceMetric(error?.code === "failed-precondition" ? "stock_conflict" : "checkout_failed", { buyerUid }).catch(() => undefined);
      if (error instanceof HttpsError) throw error;
      logger.error("Marketplace checkout failed.", { code: error?.code || "unknown" });
      throw new HttpsError("internal", "Checkout সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।");
    }
  },
);

exports.updateMarketplaceOrderStatus = onCall(
  {
    region: functionRegion,
    maxInstances: 20,
    concurrency: 10,
    timeoutSeconds: 20,
    memory: "256MiB",
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "অর্ডারের অবস্থা পরিবর্তন করতে লগইন করুন।");
    const orderId = typeof request.data?.orderId === "string" ? request.data.orderId.trim() : "";
    const nextStatus = typeof request.data?.status === "string" ? request.data.status.trim().toLowerCase() : "";
    if (!orderId || orderId.length > 160 || !isKnownStatus(nextStatus)) {
      throw new HttpsError("invalid-argument", "অর্ডার ও status তথ্য সঠিক নয়।");
    }
    const database = getDatabase();
    const orderRef = database.ref(`market_orders/${orderId}`);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists()) throw new HttpsError("not-found", "অর্ডারটি পাওয়া যাচ্ছে না।");
    const order = orderSnapshot.val() || {};
    const currentStatus = normalizeStatus(order.fulfillmentStatus || order.status);
    const isSeller = order.sellerUid === uid;
    const isBuyerCancellation = order.buyerUid === uid && nextStatus === "cancelled" && currentStatus === "pending";
    if ((!isSeller && !isBuyerCancellation) || !canTransitionMarketplaceOrder(currentStatus, nextStatus)) {
      throw new HttpsError("permission-denied", "এই অর্ডারের অবস্থা পরিবর্তনের অনুমতি নেই।");
    }
    const now = Date.now();
    const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice(-49) : [];
    history.push({ status: nextStatus, time: now, byUid: uid });
    const updates = {
      [`market_orders/${orderId}/status`]: nextStatus === "delivered" || nextStatus === "cancelled" ? nextStatus : "pending",
      [`market_orders/${orderId}/fulfillmentStatus`]: nextStatus,
      [`market_orders/${orderId}/statusHistory`]: history,
      [`market_orders/${orderId}/updatedAt`]: now,
    };

    const groupId = typeof order.orderGroupId === "string" ? order.orderGroupId : "";
    if (groupId) {
      const groupSnapshot = await database.ref(`market_order_groups/${groupId}`).get();
      const group = groupSnapshot.val() || {};
      const orderIds = Array.isArray(group.orderIds) ? group.orderIds.slice(0, 20) : [];
      const groupOrders = await Promise.all(orderIds.map(async (id) => (await database.ref(`market_orders/${id}`).get()).val()));
      const nextGroupOrders = groupOrders.map((item, index) => orderIds[index] === orderId ? { ...item, fulfillmentStatus: nextStatus, status: nextStatus === "delivered" || nextStatus === "cancelled" ? nextStatus : "pending" } : item).filter(Boolean);
      const groupStatus = deriveGroupStatus(nextGroupOrders);
      updates[`market_order_groups/${groupId}/status`] = groupStatus;
      updates[`market_order_groups/${groupId}/updatedAt`] = now;
      updates[`notifications/${order.buyerUid}/market-group-${groupId}-${groupStatus}`] = {
        type: "market_order_update",
        fromUid: String(order.sellerUid || "marketplace"),
        fromName: String(order.sellerName || "বিক্রেতা"),
        orderGroupId: groupId,
        marketOrderStatus: groupStatus,
        timestamp: now,
        read: false,
      };
    }
    await database.ref().update(updates);
    void recordMarketplaceMetric(
      nextStatus === "cancelled" ? "order_cancelled" : "order_status_changed",
      { ...order, id: orderId, fulfillmentStatus: nextStatus },
    ).catch(() => undefined);
    return { orderId, orderGroupId: groupId || null, status: nextStatus };
  },
);

exports.ensureChatMembership = onCall(
  {
    region: functionRegion,
    maxInstances: 20,
    timeoutSeconds: 15,
    memory: "256MiB",
  },
  async (request) => {
    const uid = request.auth?.uid;
    const peerUid = typeof request.data?.peerUid === "string"
      ? request.data.peerUid.trim()
      : "";
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    if (!peerUid || peerUid === uid || peerUid.length > 160) {
      throw new HttpsError("invalid-argument", "A valid peer UID is required.");
    }

    const database = getDatabase();
    const [peerSnapshot, ownBlock, peerBlock, privacySnapshot, friendshipSnapshot] =
      await Promise.all([
        database.ref(`users/${peerUid}`).get(),
        database.ref(`user_blocks/${uid}/${peerUid}`).get(),
        database.ref(`user_blocks/${peerUid}/${uid}`).get(),
        database.ref(`users/${peerUid}/settings/messagePrivacy`).get(),
        database.ref(`users/${peerUid}/friends/${uid}`).get(),
      ]);

    if (!peerSnapshot.exists() || peerSnapshot.child("status").val() === "deactivated") {
      throw new HttpsError("not-found", "The selected user is unavailable.");
    }
    if (ownBlock.exists() || peerBlock.exists()) {
      throw new HttpsError("permission-denied", "This conversation is blocked.");
    }

    const privacy = privacySnapshot.val() || "requests";
    const isFriend = friendshipSnapshot.val() === true;
    if (privacy === "friends" && !isFriend) {
      // Preserve the app's message-request UX: a non-friend may open a
      // request conversation, but the recipient's request state controls replies.
      logger.info("Provisioning a message-request chat membership.", { uid, peerUid });
    }
    if (!["everyone", "public", "requests", "friends", "friends_only", "friends-only"].includes(privacy)) {
      throw new HttpsError("failed-precondition", "This user is not accepting messages.");
    }

    const chatId = canonicalChatId(uid, peerUid);
    await database.ref(`chat_members/${chatId}`).update({
      [uid]: true,
      [peerUid]: true,
    });
    return { chatId };
  },
);

function validCloudinaryImageUrl(value) {
  return typeof value === "string"
    && value.length <= 2048
    && /^https:\/\/res\.cloudinary\.com\/[^\s]+$/i.test(value);
}

exports.submitAreaAccessRequest = onCall(
  {
    region: functionRegion,
    maxInstances: 20,
    concurrency: 10,
    timeoutSeconds: 20,
    memory: "256MiB",
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "লগইন করে area verification জমা দিন।");

    const selfieUrl = request.data?.selfieUrl;
    const nidFrontUrl = request.data?.nidFrontUrl;
    const nidBackUrl = request.data?.nidBackUrl;
    if (![selfieUrl, nidFrontUrl, nidBackUrl].every(validCloudinaryImageUrl)) {
      throw new HttpsError("invalid-argument", "Selfie এবং NID-এর দুই পাশের বৈধ ছবি প্রয়োজন।");
    }

    const database = getDatabase();
    const [profileSnapshot, existingRequestSnapshot] = await Promise.all([
      database.ref(`users/${uid}`).get(),
      database.ref(`area_access_requests/${uid}`).get(),
    ]);
    if (!profileSnapshot.exists()) {
      throw new HttpsError("failed-precondition", "আপনার profile এখনো তৈরি হয়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
    }
    const profile = profileSnapshot.val() || {};
    const existingRequest = existingRequestSnapshot.val() || {};
    if (profile.accountAccess !== "locked" && profile.accessReview !== "pending" && profile.accessReview !== "rejected") {
      throw new HttpsError("failed-precondition", "এই account-এর জন্য নতুন area verification প্রয়োজন নেই।");
    }
    if (existingRequest.status === "pending") {
      throw new HttpsError("already-exists", "আপনার area verification request ইতিমধ্যে review-এ আছে।");
    }

    const now = Date.now();
    const requestRecord = {
      uid,
      name: typeof profile.name === "string" ? profile.name.slice(0, 160) : "অজ্ঞাত",
      email: typeof profile.email === "string" ? profile.email.slice(0, 320) : "",
      phone: typeof profile.phone === "string" ? profile.phone.slice(0, 32) : "",
      union: typeof profile.union === "string" ? profile.union.slice(0, 160) : "",
      village: typeof profile.village === "string" ? profile.village.slice(0, 160) : "",
      selfieUrl,
      nidFrontUrl,
      nidBackUrl,
      // Keep the legacy field so existing admin review screens continue to work.
      nidUrl: nidFrontUrl,
      reason: typeof profile.accessReason === "string" ? profile.accessReason.slice(0, 64) : "outside_area",
      status: "pending",
      submittedAt: now,
      updatedAt: now,
    };
    await database.ref().update({
      [`users/${uid}/selfie_url`]: selfieUrl,
      [`users/${uid}/nid_front_url`]: nidFrontUrl,
      [`users/${uid}/nid_back_url`]: nidBackUrl,
      [`users/${uid}/nid_url`]: nidFrontUrl,
      [`area_access_requests/${uid}`]: requestRecord,
    });
    return { status: "pending", submittedAt: now };
  },
);

exports.processReferralEvent = onValueCreated(
  {
    ref: "/referral_events/{referrerUid}/{newUserUid}",
    region: functionRegion,
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const { referrerUid, newUserUid } = event.params;
    const eventRef = getDatabase().ref(
      `referral_events/${referrerUid}/${newUserUid}`,
    );
    const referral = event.data.val();
    if (
      !referral ||
      referral.uid !== newUserUid ||
      referrerUid === newUserUid ||
      !(await getDatabase().ref(`users/${referrerUid}`).get()).exists()
    ) {
      logger.warn("Invalid referral event ignored.", {
        referrerUid,
        newUserUid,
      });
      return;
    }

    const claim = await eventRef.child("processedAt").transaction(
      (current) => (current == null ? Date.now() : undefined),
    );
    if (!claim.committed) return;

    await getDatabase()
      .ref(`users/${referrerUid}/referral_count`)
      .transaction((current) => (Number(current) || 0) + 1);
    logger.info("Referral count incremented from trusted event.", {
      referrerUid,
      newUserUid,
    });
  },
);

exports.syncPublicUserIndex = onValueWritten(
  {
    ref: "/users/{uid}",
    region: functionRegion,
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const { uid } = event.params;
    const projection = buildPublicUserIndex(event.data.after.val(), uid);
    const indexRef = getDatabase().ref(`people_index/${uid}`);
    const visibilityRef = getDatabase().ref(`deactivated_users/${uid}`);
    const afterProfile = event.data.after.val();
    if (afterProfile?.status === "deactivated") await visibilityRef.set(true);
    else await visibilityRef.remove();
    if (!projection) {
      await indexRef.remove();
      return;
    }
    await indexRef.set(projection);
  },
);

function marketplaceOrderStatus(order) {
  return String(order?.fulfillmentStatus || order?.status || "pending");
}

exports.notifyMarketplaceOrder = onValueWritten(
  {
    ref: "/market_orders/{orderId}",
    region: functionRegion,
    maxInstances: 10,
    concurrency: 5,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after || !after.sellerUid || !after.buyerUid) return;

    const orderId = event.params.orderId;
    const currentStatus = marketplaceOrderStatus(after);
    const previousStatus = marketplaceOrderStatus(before);
    const timestamp = Date.now();
    const updates = {};
    if (!before) {
      updates[`notifications/${after.sellerUid}/market-order-${orderId}`] = {
        type: "market_order",
        fromUid: String(after.buyerUid),
        fromName: String(after.buyerName || "একজন ক্রেতা"),
        orderId,
        productTitle: String(after.productTitle || "পণ্য"),
        productImage: String(after.productImage || ""),
        buyerName: String(after.buyerName || "ক্রেতা"),
        quantity: Number(after.quantity) || 1,
        marketOrderStatus: "pending",
        timestamp,
        read: false,
      };
    } else if (currentStatus !== previousStatus) {
      updates[`notifications/${after.sellerUid}/market-order-${orderId}/marketOrderStatus`] = currentStatus;
      updates[`notifications/${after.buyerUid}/market-order-${orderId}-${currentStatus}`] = {
        type: "market_order_update",
        fromUid: String(after.sellerUid),
        fromName: String(after.sellerName || "বিক্রেতা"),
        orderId,
        productTitle: String(after.productTitle || "পণ্য"),
        productImage: String(after.productImage || ""),
        marketOrderStatus: currentStatus,
        timestamp,
        read: false,
      };
    }
    if (Object.keys(updates).length) {
      try {
        await getDatabase().ref().update(updates);
        void recordMarketplaceMetric("notification_created", { ...after, id: orderId }).catch(() => undefined);
      } catch (error) {
        void recordMarketplaceMetric("notification_failed", { ...after, id: orderId }).catch(() => undefined);
        logger.error("Marketplace notification update failed.", { code: error?.code || "unknown" });
        throw error;
      }
    }
  },
);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postExpoJson(url, payload) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const retryableError =
        error instanceof Error ? error : new Error(String(error));
      retryableError.retryable = true;
      if (attempt === 2) throw retryableError;
      await delay(500 * 2 ** attempt);
      continue;
    }

    const result = await response.json().catch(() => ({}));
    if (response.ok) return result;

    const transient = response.status === 429 || response.status >= 500;
    const message =
      result.errors
        ?.map((item) => item.message)
        .filter(Boolean)
        .join("; ") || `Expo Push Service returned HTTP ${response.status}`;
    if (!transient || attempt === 2) {
      const error = new Error(message);
      error.retryable = transient;
      throw error;
    }
    await delay(500 * 2 ** attempt);
  }
  throw new Error("Expo Push Service request failed after retries.");
}

async function dispatchPushNotification(uid, notificationId) {

    const notificationRef = getDatabase().ref(
      `notifications/${uid}/${notificationId}`,
    );
    const notificationSnapshot = await notificationRef.get();
    const notification = notificationSnapshot.val();
    const expiryAt = getNotificationExpiryAt(notification);
    if (expiryAt) {
      await getDatabase()
        .ref(`${NOTIFICATION_EXPIRY_QUEUE}/${uid}__${notificationId}`)
        .set({
          uid,
          notificationId,
          expiresAt: expiryAt,
          attempts: 0,
          nextAttemptAt: expiryAt,
        });
    }
    if (!shouldSendPush(notification, uid)) return;

    const database = getDatabase();
    const preferenceSnapshot = await database
      .ref(`users/${uid}/settings`)
      .get();
    const preferences = preferenceSnapshot.val() || {};
    if (!shouldSendPush(notification, uid, preferences)) {
      await notificationRef.child("pushDispatch").set({
        status: "suppressed",
        reason: "user_preferences",
        updatedAt: Date.now(),
      });
      return;
    }

    const dispatchRef = notificationRef.child("pushDispatch");
    const now = Date.now();
    const claim = await dispatchRef.transaction((current) => {
      const status = current?.status;
      const startedAt = Number(current?.startedAt) || 0;
      if (status === "sent" || status === "no_tokens") return;
      if (status === "dead_letter") return;
      if (Number(current?.attempt) >= MAX_DISPATCH_ATTEMPTS) {
        return { ...current, status: "dead_letter", updatedAt: now };
      }
      if (status === "sending" && now - startedAt < 5 * 60 * 1000) return;
      return {
        status: "sending",
        attempt: (Number(current?.attempt) || 0) + 1,
        startedAt: now,
        sentTokenKeys: Array.isArray(current?.sentTokenKeys)
          ? current.sentTokenKeys
          : [],
      };
    });
    if (!claim.committed) return;
    if (claim.snapshot.val()?.status === "dead_letter") return;

    try {
      const tokensSnapshot = await database
        .ref(`pushTokens/${uid}`)
        .orderByKey()
        .limitToFirst(MAX_PUSH_TOKENS_PER_NOTIFICATION)
        .get();
      const tokens = collectExpoPushTokens(
        tokensSnapshot.val(),
        MAX_PUSH_TOKENS_PER_NOTIFICATION,
      );
      if (tokens.length === 0) {
        await dispatchRef.set({
          status: "no_tokens",
          updatedAt: Date.now(),
        });
        logger.info("Push skipped: recipient has no registered Expo tokens.", {
          uid,
          notificationId,
        });
        return;
      }
      const sentTokenKeys = new Set(
        Array.isArray(claim.snapshot.val()?.sentTokenKeys)
          ? claim.snapshot.val().sentTokenKeys
          : [],
      );
      const pendingTokens = tokens.filter(
        ({ tokenKey }) => !sentTokenKeys.has(tokenKey),
      );
      if (pendingTokens.length === 0) {
        await dispatchRef.update({ status: "sent", updatedAt: Date.now() });
        return;
      }

      let accepted = 0;
      let failed = 0;
      const receiptWrites = [];
      for (let offset = 0; offset < pendingTokens.length; offset += PUSH_BATCH_SIZE) {
        const tokenBatch = pendingTokens.slice(offset, offset + PUSH_BATCH_SIZE);
        const messages = tokenBatch.map(({ token }) =>
          buildExpoPushMessage(token, notification, notificationId),
        );
        const response = await postExpoJson(EXPO_PUSH_URL, messages);
        const tickets = Array.isArray(response.data) ? response.data : [];
        const successfulTokenKeys = [];

        for (let index = 0; index < tokenBatch.length; index += 1) {
          const ticket = tickets[index];
          const tokenEntry = tokenBatch[index];
          if (ticket?.status === "ok" && ticket.id) {
            accepted += 1;
            successfulTokenKeys.push(tokenEntry.tokenKey);
              receiptWrites.push(
              database.ref(`expoPushReceipts/${ticket.id}`).set({
                ticketId: ticket.id,
                recipientUid: uid,
                tokenKey: tokenEntry.tokenKey,
                createdAt: Date.now(),
                attempts: 0,
                nextAttemptAt: Date.now() + RECEIPT_MIN_AGE_MS,
                status: "pending",
              }),
            );
            continue;
          }

          failed += 1;
          if (ticket?.details?.error === "DeviceNotRegistered") {
            await database
              .ref(`pushTokens/${uid}/${tokenEntry.tokenKey}`)
              .remove();
          }
          logger.warn("Expo rejected a push notification ticket.", {
            uid,
            notificationId,
            error: ticket?.details?.error || ticket?.message || "Unknown error",
          });
        }
        if (successfulTokenKeys.length) {
          successfulTokenKeys.forEach((tokenKey) => sentTokenKeys.add(tokenKey));
          await dispatchRef.update({
            sentTokenKeys: [...sentTokenKeys],
            updatedAt: Date.now(),
          });
        }
      }

      await Promise.all(receiptWrites);
      const status =
        accepted === 0 ? "failed" : failed > 0 ? "partial" : "sent";
      await dispatchRef.set({
        status,
        accepted,
        failed,
        sentTokenKeys: [...sentTokenKeys],
        nextAttemptAt: null,
        updatedAt: Date.now(),
      });
      await database.ref(`${PUSH_RETRY_QUEUE}/${uid}__${notificationId}`).remove();
      logger.info("Push dispatch finished.", {
        uid,
        notificationId,
        accepted,
        failed,
      });
    } catch (error) {
      const currentDispatch = claim.snapshot.val() || {};
      const attempt = Number(currentDispatch.attempt) || 1;
      const retryable = Boolean(error?.retryable);
      const errorMessage = boundedErrorMessage(error);
      if (retryable && attempt < MAX_DISPATCH_ATTEMPTS) {
        const nextAttemptAt = Date.now() + retryDelayMs(attempt);
        await dispatchRef.update({
          status: "retry_scheduled",
          nextAttemptAt,
          lastError: errorMessage,
          updatedAt: Date.now(),
        }).catch(() => undefined);
        await database.ref(`${PUSH_RETRY_QUEUE}/${uid}__${notificationId}`).set({
          uid,
          notificationId,
          attempt,
          status: "pending",
          nextAttemptAt,
          leaseUntil: 0,
          lastError: errorMessage,
          updatedAt: Date.now(),
        });
      } else {
        await dispatchRef.update({
          status: retryable ? "dead_letter" : "failed",
          nextAttemptAt: null,
          lastError: errorMessage,
          deadLetteredAt: retryable ? Date.now() : null,
          updatedAt: Date.now(),
        }).catch(() => undefined);
        if (retryable) {
          await database.ref(`${DEAD_LETTER_ROOT}/${PUSH_RETRY_QUEUE}/${uid}__${notificationId}`).set({
            uid,
            notificationId,
            attempt,
            lastError: errorMessage,
            deadLetteredAt: Date.now(),
          });
          await database.ref(`${PUSH_RETRY_QUEUE}/${uid}__${notificationId}`).remove();
        }
      }
      logger.error("Push dispatch failed.", {
        uid,
        notificationId,
        error: errorMessage,
        retryable,
        attempt,
      });
      if (retryable) throw error;
    }
}

exports.sendPushNotification = onValueCreated(
  {
    ref: "/notifications/{uid}/{notificationId}",
    region: functionRegion,
    maxInstances: 8,
    concurrency: 5,
    retry: true,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (event) => {
    const { uid, notificationId } = event.params;
    // The path also matches descendant writes; process only the notification
    // node itself, not later changes to read state or dispatch metadata.
    if (event.data.ref.key !== notificationId) return;
    await dispatchPushNotification(uid, notificationId);
  },
);

exports.retryPushNotificationQueue = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Dhaka",
    region: functionRegion,
    maxInstances: 1,
    timeoutSeconds: 120,
    memory: "256MiB",
    retryConfig: { retryCount: 3, maxRetrySeconds: 900 },
  },
  async () => {
    const database = getDatabase();
    const queueRef = database.ref(PUSH_RETRY_QUEUE);
    const deadline = pushRetryDeadline();
    const snapshot = await queueRef
      .orderByChild("nextAttemptAt")
      .endAt(Date.now())
      .limitToFirst(PUSH_RETRY_BATCH_SIZE)
      .get();
    if (!snapshot.exists()) return;

    let processed = 0;
    let deadLettered = 0;
    let failed = 0;
    const entries = [];
    snapshot.forEach((child) => entries.push({ key: child.key, value: child.val() }));
    for (const { key, value: entry } of entries) {
      if (Date.now() >= deadline) break;
      if (!key || !entry?.uid || !entry?.notificationId) {
        if (key) {
          await database.ref().update({
            [`${DEAD_LETTER_ROOT}/${PUSH_RETRY_QUEUE}/${key}`]: {
              reason: "malformed_push_retry_entry",
              record: entry || null,
              deadLetteredAt: Date.now(),
            },
            [`${PUSH_RETRY_QUEUE}/${key}`]: null,
          });
          deadLettered += 1;
        }
        continue;
      }
      const attempts = Number(entry.attempt) || 0;
      if (attempts >= MAX_DISPATCH_ATTEMPTS) {
        await database.ref().update({
          [`${DEAD_LETTER_ROOT}/${PUSH_RETRY_QUEUE}/${key}`]: { ...entry, reason: "max_attempts", deadLetteredAt: Date.now() },
          [`${PUSH_RETRY_QUEUE}/${key}`]: null,
        });
        deadLettered += 1;
        continue;
      }
      const claim = await queueRef.child(key).transaction((current) => {
        if (!current || (Number(current.leaseUntil) || 0) > Date.now()) return;
        const nextAttempt = Number(current.attempt) || 0;
        return { ...current, status: "sending", leaseUntil: Date.now() + QUEUE_LEASE_MS, attempt: nextAttempt };
      });
      if (!claim.committed) continue;
      try {
        await dispatchPushNotification(entry.uid, entry.notificationId);
        await queueRef.child(key).remove();
        processed += 1;
      } catch (error) {
        failed += 1;
        const nextAttempt = attempts + 1;
        if (error?.retryable && nextAttempt < MAX_DISPATCH_ATTEMPTS) {
          await queueRef.child(key).update({
            status: "pending",
            attempt: nextAttempt,
            leaseUntil: 0,
            nextAttemptAt: Date.now() + retryDelayMs(nextAttempt),
            lastError: boundedErrorMessage(error),
          });
        } else {
          await database.ref().update({
            [`${DEAD_LETTER_ROOT}/${PUSH_RETRY_QUEUE}/${key}`]: { ...entry, attempt: nextAttempt, lastError: boundedErrorMessage(error), deadLetteredAt: Date.now() },
            [`${PUSH_RETRY_QUEUE}/${key}`]: null,
          });
          deadLettered += 1;
        }
      }
    }
    await database.ref(`${MAINTENANCE_STATE}/pushDispatchQueue`).set({
      lastRunAt: Date.now(),
      scanned: entries.length,
      processed,
      failed,
      deadLettered,
      lastCursor: entries[entries.length - 1]?.key || null,
      timeBudgetExceeded: Date.now() >= deadline && entries.length > processed + deadLettered,
    });
    logger.info("Push retry queue processed.", { processed, failed, deadLettered, scanned: entries.length });
  },
);

exports.processExpoPushReceipts = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Dhaka",
    region: functionRegion,
    maxInstances: 1,
    timeoutSeconds: 300,
    memory: "256MiB",
    retryConfig: { retryCount: 3, maxRetrySeconds: 3600 },
  },
  async () => {
    const receiptsRef = getDatabase().ref("expoPushReceipts");
    const database = getDatabase();
    const deadline = maintenanceDeadline();
    const runStartedAt = Date.now();
    const snapshot = await receiptsRef
      .orderByChild("createdAt")
      .endAt(Date.now() - RECEIPT_MIN_AGE_MS)
      .limitToFirst(RECEIPT_SCAN_BATCH_SIZE)
      .get();
    if (!snapshot.exists()) return;

    const now = Date.now();
    const eligible = [];
    const invalidKeys = [];
    const deadLetterUpdates = {};
    snapshot.forEach((child) => {
      const receipt = child.val();
      if (!child.key || !receipt?.ticketId || !receipt?.recipientUid) {
        if (child.key) {
          deadLetterUpdates[`${DEAD_LETTER_ROOT}/expoPushReceipts/${child.key}`] = {
            reason: "malformed_receipt",
            record: receipt || null,
            movedAt: now,
          };
          invalidKeys.push(child.key);
        }
        return false;
      }
      const claimedAt = Number(receipt.claimedAt) || 0;
      const nextAttemptAt = Number(receipt.nextAttemptAt) || 0;
      if (Number(receipt.attempts) >= RECEIPT_MAX_ATTEMPTS && child.key) {
        deadLetterUpdates[`${DEAD_LETTER_ROOT}/expoPushReceipts/${child.key}`] = {
          ...receipt,
          reason: "max_attempts",
          deadLetteredAt: now,
        };
        invalidKeys.push(child.key);
        return false;
      }
      if (
        now - (Number(receipt.createdAt) || 0) >= RECEIPT_MIN_AGE_MS &&
        nextAttemptAt <= now &&
        (!claimedAt || now - claimedAt >= QUEUE_LEASE_MS) &&
        Number(receipt.attempts) < RECEIPT_MAX_ATTEMPTS
      ) {
        eligible.push({ key: child.key, ...receipt });
      }
      return false;
    });

    for (const key of invalidKeys) deadLetterUpdates[`expoPushReceipts/${key}`] = null;
    if (Object.keys(deadLetterUpdates).length) await database.ref().update(deadLetterUpdates);

    let checked = 0;
    let expired = 0;
    for (
      let offset = 0;
      offset < eligible.length && Date.now() < deadline;
      offset += RECEIPT_BATCH_SIZE
    ) {
      const batch = eligible.slice(offset, offset + RECEIPT_BATCH_SIZE);
      const claimUpdates = {};
      for (const item of batch) {
        const attempts = (Number(item.attempts) || 0) + 1;
        claimUpdates[`expoPushReceipts/${item.key}/attempts`] = attempts;
        claimUpdates[`expoPushReceipts/${item.key}/claimedAt`] = now;
        claimUpdates[`expoPushReceipts/${item.key}/status`] = "checking";
      }
      await database.ref().update(claimUpdates);
      let response;
      try {
        response = await postExpoJson(EXPO_RECEIPTS_URL, {
          ids: batch.map((item) => item.ticketId),
        });
      } catch (error) {
        const updates = {};
        for (const item of batch) {
          const attempts = (Number(item.attempts) || 0) + 1;
          if (error?.retryable && attempts < RECEIPT_MAX_ATTEMPTS) {
            updates[`expoPushReceipts/${item.key}`] = {
              ...item,
              attempts,
              status: "pending",
              nextAttemptAt: Date.now() + retryDelayMs(attempts),
              lastError: boundedErrorMessage(error),
            };
          } else {
            updates[`${DEAD_LETTER_ROOT}/expoPushReceipts/${item.key}`] = {
              ...item,
              attempts,
              deadLetteredAt: Date.now(),
              lastError: boundedErrorMessage(error),
            };
            updates[`expoPushReceipts/${item.key}`] = null;
          }
        }
        await database.ref().update(updates);
      if (error?.retryable) throw error;
        continue;
      }
      const receipts = response.data || {};
      const removals = [];

      for (const item of batch) {
        const result = receipts[item.ticketId];
        if (!result) {
          if (now - (Number(item.createdAt) || 0) >= RECEIPT_MAX_AGE_MS) {
            removals.push(receiptsRef.child(item.key).remove());
            expired += 1;
          }
          else {
            removals.push(receiptsRef.child(item.key).update({ status: "pending", nextAttemptAt: Date.now() + retryDelayMs(Number(item.attempts) || 1), claimedAt: 0 }));
          }
          continue;
        }

        if (
          result.status === "error" &&
          result.details?.error === "DeviceNotRegistered" &&
          item.tokenKey
        ) {
          removals.push(
            getDatabase()
              .ref(`pushTokens/${item.recipientUid}/${item.tokenKey}`)
              .remove(),
          );
        }
        removals.push(receiptsRef.child(item.key).remove());
        checked += 1;
      }

      await Promise.all(removals);
    }

    logger.info("Expo push receipts checked.", {
      eligible: eligible.length,
      checked,
      expired,
      timeBudgetExceeded: Date.now() >= deadline && eligible.length > checked,
      durationMs: Date.now() - runStartedAt,
    });
    await database.ref(`${MAINTENANCE_STATE}/expoPushReceipts`).set({
      lastRunAt: Date.now(),
      scanned: snapshot.numChildren(),
      eligible: eligible.length,
      checked,
      expired,
      oldestCreatedAt: eligible[0]?.createdAt || null,
      lastCursor: eligible[eligible.length - 1]?.key || null,
      timeBudgetExceeded: Date.now() >= deadline && eligible.length > checked,
    });
  },
);

exports.cleanupExpiredNotifications = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Asia/Dhaka",
    region: functionRegion,
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
    retryConfig: { retryCount: 3, maxRetrySeconds: 3600 },
  },
  async () => {
    const database = getDatabase();
    const queueRef = database.ref(NOTIFICATION_EXPIRY_QUEUE);
    const deadline = maintenanceDeadline();
    const runStartedAt = Date.now();
    const snapshot = await queueRef
      .orderByChild("expiresAt")
      .endAt(Date.now())
      .limitToFirst(DELETE_BATCH_SIZE)
      .get();
    if (!snapshot.exists()) {
      logger.info("Notification cleanup skipped: no due queue entries.");
      return;
    }

    let queued = 0;
    let deadLettered = 0;
    let failed = 0;
    const entries = [];
    snapshot.forEach((child) => entries.push({ key: child.key, value: child.val() }));
    for (const { key, value: entry } of entries) {
      if (Date.now() >= deadline) break;
      if (!key) continue;
      if (!entry?.uid || !entry?.notificationId) {
        await database.ref().update({
          [`${DEAD_LETTER_ROOT}/notificationExpiryQueue/${key}`]: {
            reason: "malformed_expiry_entry",
            record: entry || null,
            movedAt: Date.now(),
          },
          [`${NOTIFICATION_EXPIRY_QUEUE}/${key}`]: null,
        });
        deadLettered += 1;
        continue;
      }
      const attempts = Number(entry.attempts) || 0;
      const leaseUntil = Number(entry.leaseUntil) || 0;
      const nextAttemptAt = Number(entry.nextAttemptAt) || 0;
      if (attempts >= NOTIFICATION_MAX_ATTEMPTS) {
        await database.ref().update({
          [`${DEAD_LETTER_ROOT}/notificationExpiryQueue/${key}`]: { ...entry, deadLetteredAt: Date.now(), reason: "max_attempts" },
          [`${NOTIFICATION_EXPIRY_QUEUE}/${key}`]: null,
        });
        deadLettered += 1;
        continue;
      }
      if (leaseUntil > Date.now() || nextAttemptAt > Date.now()) continue;
      const claim = await queueRef.child(key).transaction((current) => {
        if (!current || (Number(current.leaseUntil) || 0) > Date.now()) return;
        const nextAttempts = (Number(current.attempts) || 0) + 1;
        if (nextAttempts > NOTIFICATION_MAX_ATTEMPTS) return;
        return { ...current, attempts: nextAttempts, leaseUntil: Date.now() + QUEUE_LEASE_MS, status: "deleting" };
      });
      if (!claim.committed) continue;
      const claimed = claim.snapshot.val() || {};
      try {
        await database.ref(`notifications/${claimed.uid}/${claimed.notificationId}`).remove();
        await queueRef.child(key).remove();
        queued += 1;
      } catch (error) {
        failed += 1;
        const nextAttempts = Number(claimed.attempts) || 1;
        if (nextAttempts >= NOTIFICATION_MAX_ATTEMPTS) {
          await database.ref().update({
            [`${DEAD_LETTER_ROOT}/notificationExpiryQueue/${key}`]: { ...claimed, deadLetteredAt: Date.now(), lastError: boundedErrorMessage(error) },
            [`${NOTIFICATION_EXPIRY_QUEUE}/${key}`]: null,
          });
          deadLettered += 1;
        } else {
          await queueRef.child(key).update({ status: "pending", leaseUntil: 0, nextAttemptAt: Date.now() + retryDelayMs(nextAttempts), lastError: boundedErrorMessage(error) });
        }
        if (error?.retryable) throw error;
      }
    }
    logger.info("Expired notification cleanup finished.", {
      queued,
      deletedNotifications: queued,
      failed,
      deadLettered,
      durationMs: Date.now() - runStartedAt,
      timeBudgetExceeded: Date.now() >= deadline && entries.length > queued + deadLettered,
    });
    await database.ref(`${MAINTENANCE_STATE}/notificationCleanup`).set({
      lastRunAt: Date.now(),
      scanned: entries.length,
      deleted: queued,
      failed,
      deadLettered,
      oldestExpiresAt: entries[0]?.value?.expiresAt || null,
      lastCursor: entries[entries.length - 1]?.key || null,
      timeBudgetExceeded: Date.now() >= deadline && entries.length > queued + deadLettered,
    });
  },
);

exports.indexTrashForExpiry = onValueCreated(
  "trash_bin/{uid}/{postId}",
  async (event) => {
    const record = event.data.val() || {};
    const expiresAt = Number(record.expiresAt);
    const uid = event.params.uid;
    const postId = event.params.postId;
    if (!uid || !postId || !Number.isFinite(expiresAt) || expiresAt <= 0) return;
    await getDatabase().ref(`trashExpiryQueue/${uid}_${postId}`).set({
      uid,
      postId,
      expiresAt,
      indexedAt: Date.now(),
    });
  },
);

exports.cleanupExpiredTrash = onSchedule(
  {
    schedule: "30 3 * * *",
    timeZone: "Asia/Dhaka",
    region: functionRegion,
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
    retryConfig: { retryCount: 3, maxRetrySeconds: 3600 },
  },
  async () => {
    const database = getDatabase();
    const now = Date.now();
    const snapshot = await database
      .ref("trashExpiryQueue")
      .orderByChild("expiresAt")
      .endAt(now)
      .limitToFirst(DELETE_BATCH_SIZE)
      .get();
    const updates = {};
    let scanned = 0;
    let deleted = 0;
    snapshot.forEach((queueSnapshot) => {
      scanned += 1;
      const record = queueSnapshot.val() || {};
      if (record.uid && record.postId) {
        updates[`trash_bin/${record.uid}/${record.postId}`] = null;
        updates[`trashExpiryQueue/${queueSnapshot.key}`] = null;
        deleted += 1;
      } else {
        updates[`trashExpiryQueue/${queueSnapshot.key}`] = null;
      }
      return false;
    });
    if (Object.keys(updates).length) await database.ref().update(updates);
    const timeBudgetExceeded = snapshot.size >= DELETE_BATCH_SIZE;
    await database.ref(`${MAINTENANCE_STATE}/trashCleanup`).set({
      lastRunAt: now,
      scanned,
      deleted,
      timeBudgetExceeded,
      lastCursor: snapshot.size ? snapshot.val() && Object.keys(snapshot.val()).at(-1) : null,
    });
    logger.info("Expired Trash Bin cleanup finished.", { scanned, deleted, timeBudgetExceeded });
  },
);
