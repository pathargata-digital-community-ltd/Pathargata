const { defineSecret, defineString } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getDatabase } = require("firebase-admin/database");

const AI_API_KEY = defineSecret("PATHARGATA_AI_API_KEY");
const AI_API_BASE = defineString("PATHARGATA_AI_API_BASE", {
  default: "https://api.openai.com/v1",
});
const AI_MODEL = defineString("PATHARGATA_AI_MODEL", {
  default: "gpt-4o-mini",
});

const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_ITEMS = 8;
const MAX_RESULTS = 12;
const MAX_DIRECTORY_ROWS_PER_CATEGORY = 20;
const MAX_MARKET_ROWS = 30;
const MAX_ORDER_ROWS = 20;
const MAX_NOTIFICATION_ROWS = 15;

const directoryCategoryAliases = [
  ["fire", ["ফায়ার", "ফায়ার", "আগুন", "fire"]],
  ["health", ["হাসপাতাল", "ডাক্তার", "চিকিৎসা", "health"]],
  ["police", ["থানা", "পুলিশ", "police"]],
  ["ambulance", ["অ্যাম্বুলেন্স", "ambulance"]],
  ["electricity", ["বিদ্যুৎ", "electricity"]],
  ["uno", ["ইউএনও", "উপজেলা প্রশাসন", "uno"]],
  ["acland", ["ভূমি", "land office", "ac land"]],
  ["union", ["ইউপি", "ইউনিয়ন পরিষদ", "ইউনিয়ন পরিষদ"]],
  ["doctor", ["বিশেষজ্ঞ", "ডাক্তার", "doctor"]],
  ["ambulance", ["অ্যাম্বুলেন্স", "ambulance"]],
  ["agriculture", ["কৃষি", "কৃষি সহায়তা", "কৃষি সহায়তা", "agriculture", "farmer"]],
];

const directorySearchStopWords = new Set([
  "নম্বর", "নাম্বার", "নম্ব", "ফোন", "মোবাইল", "যোগাযোগ", "দাও", "দেখাও", "দেখতে", "খুঁজুন", "খুঁজে", "সার্চ", "চাই", "দরকার",
  "কোথায়", "কোথায়", "আছে", "এর", "জন্য", "কাছের", "কাছাকাছি", "ঠিকানা", "address", "location", "সার্ভিস", "service", "number", "phone", "mobile", "contact", "show", "find", "search",
]);

const publicDirectoryFields = [
  "name",
  "title",
  "designation",
  "details",
  "address",
  "phone",
  "website",
  "availability",
  "hours",
  "is_active_24_7",
  "specialty",
  "chamber_time",
  "days_available",
  "hospital_chamber",
  "rating",
  "total_reviews",
  "lat",
  "lng",
  "verified",
];

const publicProductFields = [
  "title",
  "price",
  "category",
  "desc",
  "description",
  "seller",
  "availability",
  "stock",
  "shopId",
  "image",
  "images",
  "address",
  "union",
  "village",
  "time",
];

function text(value, max = 240) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, max)
    : "";
}

function normalize(value) {
  return text(value, 500).toLocaleLowerCase("bn-BD");
}

function limitRows(value, limit) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(([, row]) => row && typeof row === "object")
    .slice(0, limit)
    .map(([id, row]) => ({ id, ...(row || {}) }));
}

function pickFields(row, fields) {
  const result = {};
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== "") {
      result[field] = row[field];
    }
  }
  return result;
}

function searchableText(row) {
  return Object.values(row)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLocaleLowerCase("bn-BD");
}

function findCategory(query) {
  const normalized = normalize(query);
  return directoryCategoryAliases.find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))?.[0] || null;
}

function normalizeDirectoryToken(token) {
  return token
    .replace(/[.,!?;:()[\]{}"'“”‘’]/g, "")
    .replace(/(গুলোর|গুলির|দের|টির|টির|র|এর|ের|কে|তে|য়|য়)$/u, "")
    .trim();
}

function directorySearchTerms(query, category) {
  const normalized = normalize(query);
  const aliases = directoryCategoryAliases.find(([id]) => id === category)?.[1] || [];
  return normalized
    .split(/\s+/)
    .map(normalizeDirectoryToken)
    .filter((token) => token.length >= 2)
    .filter((token) => !directorySearchStopWords.has(token))
    .filter((token) => !aliases.some((alias) => token === normalizeDirectoryToken(alias) || token.startsWith(normalizeDirectoryToken(alias))))
    .slice(0, 8);
}

function rankDirectoryRows(rows, query, category, limit = MAX_RESULTS) {
  const terms = directorySearchTerms(query, category);
  if (!terms.length) return rows.slice(0, limit);
  return rows
    .map((row) => {
      const haystack = searchableText(row);
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.row);
}

function matchingRows(rows, query, limit = MAX_RESULTS) {
  const normalized = normalize(query);
  if (!normalized) return rows.slice(0, limit);
  return rows.filter((row) => searchableText(row).includes(normalized)).slice(0, limit);
}

function safeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 500) }));
}

function publicDirectoryRow(id, category, row) {
  return {
    type: "directory",
    data: {
      id,
      category,
      ...pickFields(row, publicDirectoryFields),
    },
  };
}

async function searchPublicDirectory(database, query) {
  const category = findCategory(query);
  const categories = category ? [category] : directoryCategoryAliases.map(([id]) => id);
  const perCategoryLimit = category ? MAX_DIRECTORY_ROWS_PER_CATEGORY : 8;
  const snapshots = await Promise.all(
    categories.map((item) => database.ref(`directory/${item}`).limitToFirst(perCategoryLimit).get()),
  );
  const rows = snapshots.flatMap((snapshot, index) =>
    limitRows(snapshot.val(), perCategoryLimit).map((row) => ({
      ...row,
      category: categories[index],
    })),
  );
  return rankDirectoryRows(rows, query, category).map((row) => publicDirectoryRow(row.id, row.category, row));
}

async function searchMarketplaceProducts(database, query) {
  const snapshot = await database
    .ref("market_items")
    .orderByChild("time")
    .limitToLast(MAX_MARKET_ROWS)
    .get();
  return matchingRows(limitRows(snapshot.val(), MAX_MARKET_ROWS), query).map((row) => ({
    type: "product",
    data: pickFields(row, publicProductFields),
  }));
}

async function getOwnOrders(database, uid, query) {
  const [buyerSnapshot, sellerSnapshot] = await Promise.all([
    database.ref("market_orders").orderByChild("buyerUid").equalTo(uid).limitToLast(MAX_ORDER_ROWS).get(),
    database.ref("market_orders").orderByChild("sellerUid").equalTo(uid).limitToLast(MAX_ORDER_ROWS).get(),
  ]);
  const rows = new Map();
  for (const row of [
    ...limitRows(buyerSnapshot.val(), MAX_ORDER_ROWS),
    ...limitRows(sellerSnapshot.val(), MAX_ORDER_ROWS),
  ]) {
    rows.set(row.id, {
      id: row.id,
      productTitle: text(row.productTitle, 160) || "পণ্য",
      quantity: Number(row.quantity) || 1,
      status: text(row.fulfillmentStatus || row.status, 40) || "pending",
      time: Number(row.time) || 0,
      role: row.sellerUid === uid ? "seller" : "buyer",
      deliveryMethod: text(row.deliveryMethod, 40),
      paymentMethod: text(row.paymentMethod, 40),
    });
  }
  const result = [...rows.values()].sort((a, b) => b.time - a.time);
  return matchingRows(result, query).slice(0, MAX_RESULTS).map((row) => ({ type: "order", data: row }));
}

async function getOwnNotifications(database, uid, query) {
  const snapshot = await database.ref(`notifications/${uid}`).limitToLast(MAX_NOTIFICATION_ROWS).get();
  return matchingRows(limitRows(snapshot.val(), MAX_NOTIFICATION_ROWS), query)
    .sort((a, b) => Number(b.timestamp || b.sentAt || 0) - Number(a.timestamp || a.sentAt || 0))
    .slice(0, MAX_RESULTS)
    .map((row) => ({
      type: "notification",
      data: pickFields(row, ["type", "fromName", "productTitle", "quantity", "marketOrderStatus", "timestamp", "read"]),
    }));
}

async function buildContext(database, uid, message) {
  const normalized = normalize(message);
  const context = { results: [], capabilities: ["public_directory", "marketplace_products", "own_orders", "own_notifications", "app_navigation"] };
  const tasks = [];
  const orderAction = /অর্ডার.*(গ্রহণ|নিশ্চিত)|গ্রহণ.*অর্ডার|accept.*order|confirm.*order/i.test(normalized);
  if (/ডিরেক্টরি|হাসপাতাল|ডাক্তার|ফায়ার|ফায়ার|থানা|পুলিশ|ইউএনও|অফিস|নম্বর|ফোন|ঠিকানা|directory|hospital|doctor|fire|police/i.test(normalized)) {
    tasks.push(searchPublicDirectory(database, message).then((items) => { context.results.push(...items); }));
  }
  if (/বাজার|পণ্য|দোকান|মার্কেট|product|shop|market/i.test(normalized)) {
    tasks.push(searchMarketplaceProducts(database, message).then((items) => { context.results.push(...items); }));
  }
  if (/অর্ডার|order|ক্রয়|কেনা|বিক্রি|seller|buyer/i.test(normalized)) {
    tasks.push(getOwnOrders(database, uid, orderAction ? "" : message).then((items) => { context.results.push(...items); }));
  }
  if (/নোটিফিকেশন|notification|আপডেট|বার্তা/i.test(normalized)) {
    tasks.push(getOwnNotifications(database, uid, message).then((items) => { context.results.push(...items); }));
  }
  await Promise.all(tasks);
  context.results = context.results.slice(0, MAX_RESULTS);
  return context;
}

function isBloodRequestIntent(message) {
  const normalized = normalize(message);
  return /রক্ত|blood/i.test(normalized) && /চাই|দরকার|প্রয়োজন|প্রয়োজন|request|অনুরোধ|পাঠাও|তৈরি/i.test(normalized);
}

function isOrderAcceptIntent(message) {
  return /অর্ডার.*(গ্রহণ|নিশ্চিত)|গ্রহণ.*অর্ডার|accept.*order|confirm.*order/i.test(normalize(message));
}

function buildActionResponse(context, message) {
  const normalized = normalize(message);
  const navigation = normalized.includes("রক্ত সেবা") || normalized.includes("blood service")
    ? ["রক্ত সেবা খুলুন", "/service/blood"]
    : normalized.includes("কৃষি") || normalized.includes("agriculture")
      ? ["কৃষি সেবা খুলুন", "/service/agriculture"]
      : normalized.includes("অভিযোগ") || normalized.includes("complaint")
        ? ["অভিযোগ কেন্দ্র খুলুন", "/services"]
        : normalized.includes("আমার অর্ডার") || normalized.includes("my order")
          ? ["অর্ডার দেখুন", "/service/market"]
          : null;
  if (navigation && !isBloodRequestIntent(message)) {
    return {
      text: "আপনার প্রয়োজনীয় সেবাটি খুলে দিচ্ছি।",
      intent: "navigation",
      cards: [],
      actions: [{ id: `navigate-${navigation[1]}`, label: navigation[0], kind: "open_route", payload: { route: navigation[1] } }],
    };
  }
  if (isBloodRequestIntent(message)) {
    return {
      text: "রক্তের অনুরোধ তৈরি করতে নিচের ফর্মটি পূরণ করুন। সব তথ্য যাচাই করে তারপর অনুরোধ পাঠানো হবে।",
      intent: "blood_request_draft",
      cards: [],
      actions: [{ id: "blood-request", label: "রক্তের অনুরোধ তৈরি করুন", kind: "open_blood_request", payload: {} }],
    };
  }
  if (isOrderAcceptIntent(message)) {
    const sellerOrders = context.results.filter((item) => item.type === "order" && item.data?.role === "seller");
    const pending = sellerOrders.filter((item) => item.data?.status === "pending");
    if (pending.length === 1) {
      const order = pending[0].data;
      return {
        text: `“${order.productTitle || "পণ্য"}” অর্ডারটি গ্রহণ করার আগে নিচের button চাপুন।`,
        intent: "order_confirmation",
        cards: [pending[0]],
        actions: [{ id: `accept-order-${order.id}`, label: "অর্ডার গ্রহণের জন্য দেখুন", kind: "confirm_order", payload: { orderId: String(order.id), productTitle: String(order.productTitle || "পণ্য"), quantity: String(order.quantity || 1) } }],
      };
    }
    return {
      text: pending.length > 1 ? "আপনার একাধিক pending seller order আছে। নির্দিষ্ট পণ্যের নাম লিখে আবার বলুন।" : "আপনার নামে গ্রহণ করার মতো pending seller order পাওয়া যায়নি।",
      intent: "clarification",
      cards: pending,
      actions: [],
    };
  }
  return null;
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    intent: { type: "string", enum: ["answer", "search_result", "navigation", "clarification", "error", "blood_request_draft", "order_confirmation"] },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["directory", "product", "order", "notification", "service"] },
          data: { type: "object", additionalProperties: true },
        },
        required: ["type", "data"],
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          kind: { type: "string", enum: ["open_route", "call", "map", "retry", "open_blood_request", "confirm_order"] },
          payload: { type: "object", additionalProperties: { type: "string" } },
        },
        required: ["id", "label", "kind", "payload"],
      },
    },
  },
  required: ["text", "intent", "cards", "actions"],
};

function parseModelContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI response content is unavailable");
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed.text !== "string" || typeof parsed.intent !== "string") {
    throw new Error("AI response shape is invalid");
  }
  return {
    text: parsed.text.slice(0, 1600),
    intent: parsed.intent,
    cards: Array.isArray(parsed.cards) ? parsed.cards.slice(0, MAX_RESULTS) : [],
    actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 6) : [],
  };
}

function fallbackResponse(context) {
  if (context.results.length) {
    return {
      text: "আপনার প্রশ্নের সঙ্গে সম্পর্কিত তথ্য পাওয়া গেছে। নিচের তথ্যগুলো দেখুন।",
      intent: "search_result",
      cards: context.results,
      actions: [],
    };
  }
  return {
    text: "আমি এই তথ্যটি এখন খুঁজে পাইনি। অন্যভাবে লিখে চেষ্টা করুন, অথবা Home-এর সেবা ও search অপশন ব্যবহার করুন।",
    intent: "clarification",
    cards: [],
    actions: [],
  };
}

function normalizeMobile(value) {
  const digits = text(value, 32).replace(/[\s()-]/g, "");
  if (/^01[3-9]\d{8}$/.test(digits)) return digits;
  if (/^8801[3-9]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^\+8801[3-9]\d{8}$/.test(digits)) return `0${digits.slice(4)}`;
  return null;
}

function idempotencyKey(value) {
  const key = text(value, 120).replace(/[^A-Za-z0-9_-]/g, "");
  return key.length >= 8 ? key : null;
}

function bloodRequestExpiry(urgency) {
  return Date.now() + (urgency === "critical" ? 24 : 72) * 60 * 60 * 1000;
}

exports.createBloodRequest = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 20,
    concurrency: 20,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = request.data && typeof request.data === "object" ? request.data : {};
    const key = idempotencyKey(input.idempotencyKey);
    if (!key) throw new HttpsError("invalid-argument", "A valid idempotency key is required.");
    const bloodGroup = text(input.bloodGroup, 8);
    const hospital = text(input.hospital, 200);
    const area = text(input.area, 160);
    const neededAt = text(input.neededAt, 120);
    const contact = normalizeMobile(input.contact);
    const units = String(Math.floor(Number(input.units || 1)));
    const urgency = text(input.urgency, 20);
    const patientName = text(input.patientName, 160);
    const details = text(input.details, 2000);
    if (!["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(bloodGroup)) {
      throw new HttpsError("invalid-argument", "A valid blood group is required.");
    }
    if (!hospital || !area || !neededAt || !contact) {
      throw new HttpsError("invalid-argument", "Hospital, area, needed time and contact are required.");
    }
    if (!/^\d+$/.test(units) || Number(units) < 1 || Number(units) > 20) {
      throw new HttpsError("invalid-argument", "Units must be between 1 and 20.");
    }
    if (!["critical", "today", "planned"].includes(urgency)) {
      throw new HttpsError("invalid-argument", "A valid urgency is required.");
    }

    const database = getDatabase();
    const claimRef = database.ref(`aiActionIdempotency/${uid}/blood-${key}`);
    const requestRef = database.ref("blood_requests").push();
    const requestId = requestRef.key;
    if (!requestId) throw new HttpsError("internal", "Request id could not be created.");
    const claim = await claimRef.transaction((current) => current == null ? { requestId, createdAt: Date.now() } : undefined);
    if (!claim.committed) {
      const existingId = text(claim.snapshot.val()?.requestId, 80);
      if (existingId) return { requestId: existingId, duplicate: true };
      throw new HttpsError("already-exists", "This request has already been submitted.");
    }

    const recent = await database.ref("blood_requests").orderByChild("requesterUid").equalTo(uid).limitToLast(30).get();
    const activeStatuses = new Set(["new", "verification_in_progress", "awaiting_donor_response", "donor_responded", "arrangements_confirmed"]);
    const duplicate = limitRows(recent.val(), 30).find((row) => activeStatuses.has(text(row.status)) && text(row.bloodGroup) === bloodGroup && text(row.area) === area && Number(row.expiresAt || 0) > Date.now());
    if (duplicate) {
      await claimRef.remove().catch(() => undefined);
      throw new HttpsError("already-exists", "আপনার একই এলাকার এই রক্তের একটি active request আছে।");
    }

    const profile = await database.ref(`users/${uid}`).get();
    const profileData = profile.val() && typeof profile.val() === "object" ? profile.val() : {};
    const now = Date.now();
    const trackingId = `BLD-${new Date(now).toISOString().slice(0, 10).replace(/-/g, "")}-${requestId.slice(-6).toUpperCase()}`;
    const updates = {
      [`blood_requests/${requestId}`]: {
        requesterUid: uid,
        trackingId,
        bloodGroup,
        area,
        units,
        urgency,
        neededAt,
        status: "new",
        verificationStatus: "pending",
        nextAction: "Admin যাচাই করে উপযুক্ত ডোনার নির্বাচন করবেন",
        createdAt: now,
        updatedAt: now,
        expiresAt: bloodRequestExpiry(urgency),
        updatedBy: uid,
      },
      [`blood_request_private/${requestId}`]: {
        requesterUid: uid,
        contact,
        requesterName: text(profileData.name || request.auth.token?.name || "", 160),
        patientName,
        hospital,
        details,
        createdAt: now,
      },
    };
    try {
      await database.ref().update(updates);
    } catch (error) {
      await claimRef.remove().catch(() => undefined);
      throw new HttpsError("internal", "Blood request could not be saved.");
    }
    return { requestId, trackingId, duplicate: false };
  },
);

exports.acceptMarketplaceOrder = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 20,
    concurrency: 20,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const orderId = text(request.data?.orderId, 160);
    const key = idempotencyKey(request.data?.idempotencyKey);
    if (!orderId || !key) throw new HttpsError("invalid-argument", "Order id and idempotency key are required.");
    const database = getDatabase();
    const orderRef = database.ref(`market_orders/${orderId}`);
    const before = await orderRef.get();
    if (!before.exists()) throw new HttpsError("not-found", "Order not found.");
    const order = before.val() || {};
    if (order.sellerUid !== uid) throw new HttpsError("permission-denied", "Only the seller can accept this order.");
    const currentStatus = text(order.fulfillmentStatus || order.status, 40) || "pending";
    if (currentStatus === "accepted") return { orderId, status: "accepted", alreadyApplied: true };
    if (currentStatus !== "pending") throw new HttpsError("failed-precondition", "Only pending orders can be accepted.");

    const claimRef = database.ref(`aiActionIdempotency/${uid}/order-${orderId}-${key}`);
    const claim = await claimRef.transaction((current) => current == null ? { orderId, createdAt: Date.now() } : undefined);
    if (!claim.committed) return { orderId, status: "accepted", alreadyApplied: true };
    const result = await orderRef.transaction((current) => {
      if (!current || current.sellerUid !== uid) return;
      const status = text(current.fulfillmentStatus || current.status, 40) || "pending";
      if (status !== "pending") return current;
      const history = Array.isArray(current.statusHistory) ? current.statusHistory : current.statusHistory && typeof current.statusHistory === "object" ? Object.values(current.statusHistory) : [];
      return {
        ...current,
        status: "pending",
        fulfillmentStatus: "accepted",
        statusHistory: [...history, { status: "accepted", time: Date.now(), byUid: uid }],
        updatedAt: Date.now(),
      };
    });
    const finalStatus = text(result.snapshot.val()?.fulfillmentStatus || result.snapshot.val()?.status, 40);
    if (!result.committed || finalStatus !== "accepted") throw new HttpsError("aborted", "Order changed before it could be accepted.");
    return { orderId, status: "accepted", alreadyApplied: false };
  },
);

function isAiAssistantEnabled(settings) {
  return settings?.enabled === true;
}

exports.aiAssistant = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 45,
    memory: "512MiB",
    maxInstances: 20,
    concurrency: 10,
    secrets: [AI_API_KEY],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const database = getDatabase();
    const aiSettingsSnapshot = await database.ref("admin_settings/ai_assistant").get();
    if (!isAiAssistantEnabled(aiSettingsSnapshot.val())) {
      throw new HttpsError("failed-precondition", "AI_ASSISTANT_DISABLED");
    }
    const message = text(request.data?.message, MAX_MESSAGE_LENGTH);
    if (!message) throw new HttpsError("invalid-argument", "A message is required.");

    const context = await buildContext(database, uid, message);
    const actionResponse = buildActionResponse(context, message);
    if (actionResponse) return actionResponse;
    const apiKey = AI_API_KEY.value();
    if (!apiKey) return fallbackResponse(context);

    const system = [
      "তুমি Pathargata Digital App-এর Bengali-first read-only AI সহকারী।",
      "শুধু দেওয়া context ব্যবহার করে উত্তর দাও; context-এর বাইরে data বানিয়ে বলবে না।",
      "Natural language থেকে কোনো write action সরাসরি করবে না। Blood request ও seller order acceptance-এর জন্য dedicated confirmation popup ব্যবহার হবে; message send, complaint submit বা security change এই ধাপে সমর্থিত নয়।",
      "অন্য user-এর private data কখনো প্রকাশ করবে না। Directory-এর phone/address কেবল public context-এ থাকলে দেখাবে।",
      "User প্রশ্ন অস্পষ্ট হলে clarification চাইবে। Medical/legal/financial certainty বা guaranteed blood availability দাবি করবে না।",
      "উত্তর সংক্ষিপ্ত, ভদ্র এবং সহজ বাংলায় দাও। Navigation চাইলে allowlisted route action ব্যবহার করো: /search, /notifications, /services, /service/directory, /service/market, /service/blood, /service/agriculture, /settings।",
      "Output JSON schema অনুসরণ করো।",
    ].join("\n");
    const userPayload = JSON.stringify({ message, context });
    const response = await fetch(`${AI_API_BASE.value().replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODEL.value(),
        messages: [
          { role: "system", content: system },
          ...safeHistory(request.data?.history),
          { role: "user", content: userPayload },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 900,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("AI provider request failed", response.status, detail.slice(0, 240));
      return fallbackResponse(context);
    }
    try {
      return parseModelContent(await response.json());
    } catch (error) {
      console.error("AI response parsing failed", error instanceof Error ? error.message : "unknown_error");
      return fallbackResponse(context);
    }
  },
);

exports._test = {
  findCategory,
  directorySearchTerms,
  rankDirectoryRows,
  pickFields,
  fallbackResponse,
  safeHistory,
  buildActionResponse,
  isAiAssistantEnabled,
  normalizeMobile,
  buildContext,
};
