const crypto = require("node:crypto");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { defineSecret } = require("firebase-functions/params");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

const CLOUDINARY_CLOUD_NAME = "dl1auoanl";
const CLOUDINARY_API_KEY = defineSecret("CLOUDINARY_API_KEY");
const CLOUDINARY_API_SECRET = defineSecret("CLOUDINARY_API_SECRET");
const CLOUDINARY_DELETE_TYPES = ["image", "video", "raw"];
const MAX_MEDIA_ITEMS = 500;

function isAdmin(request) {
  return request.auth?.token?.admin === true;
}

function assertAdmin(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  if (!isAdmin(request)) throw new HttpsError("permission-denied", "Admin permission required.");
}

function cloudinaryPublicIdFromUrl(value) {
  if (typeof value !== "string" || !value.startsWith("https://res.cloudinary.com/")) return null;
  try {
    const url = new URL(value);
    const marker = "/upload/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    let path = url.pathname.slice(index + marker.length).replace(/^v\d+\//, "");
    path = path.split("?")[0].replace(/\.[^.\/]+$/, "");
    return path && path.length <= 1024 ? path : null;
  } catch {
    return null;
  }
}

function collectCloudinaryUrls(value, output = new Set()) {
  if (output.size >= MAX_MEDIA_ITEMS) return output;
  if (typeof value === "string") {
    if (cloudinaryPublicIdFromUrl(value)) output.add(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectCloudinaryUrls(item, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectCloudinaryUrls(item, output));
  }
  return output;
}

function cloudinarySignature(params, secret) {
  const body = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto.createHash("sha1").update(`${body}${secret}`).digest("hex");
}

async function destroyCloudinaryUrl(url, secret, apiKey, fetchImpl = fetch) {
  const publicId = cloudinaryPublicIdFromUrl(url);
  if (!publicId) return { skipped: true };
  const parsed = new URL(url);
  const resourceType = CLOUDINARY_DELETE_TYPES.includes(parsed.pathname.split("/")[2])
    ? parsed.pathname.split("/")[2]
    : "image";
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { public_id: publicId, timestamp };
  const signature = cloudinarySignature(payload, secret);
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`;
  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature });
  const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.result !== "ok" && data.result !== "not found")) {
    throw new Error(`CLOUDINARY_DELETE_FAILED:${data.error?.message || data.result || response.status}`);
  }
  return { publicId, resourceType, result: data.result };
}

async function ownedRecords(database, path, ownerFields, uid) {
  const records = [];
  for (const ownerField of ownerFields) {
    const snapshot = await database.ref(path).orderByChild(ownerField).equalTo(uid).once("value");
    snapshot.forEach((child) => records.push({ path: `${path}/${child.key}`, value: child.val() }));
  }
  return records;
}

async function collectPurgeData(database, uid) {
  const directPaths = [
    `users/${uid}`, `people_index/${uid}`, `pushTokens/${uid}`, `status/${uid}`, `user_chats/${uid}`,
    `user_blocks/${uid}`, `notifications/${uid}`, `account_lifecycle_requests/${uid}`, `account_deletion_requests/${uid}`,
    `verification_requests/${uid}`, `area_access_requests/${uid}`, `monetization_requests/${uid}`, `withdraw_requests/${uid}`,
  ];
  const records = [];
  for (const path of directPaths) {
    const snapshot = await database.ref(path).once("value");
    if (snapshot.exists()) records.push({ path, value: snapshot.val() });
  }
  const collections = [
    ["posts", ["uid", "authorId"]], ["stories", ["uid", "authorId"]], ["complaints", ["uid", "authorId"]],
    ["blood_requests", ["requesterUid", "uid"]], ["market_shops", ["uid", "ownerUid"]], ["market_items", ["uid", "sellerUid"]],
    ["service_requests", ["uid", "userId"]], ["registered_devices", ["uid"]],
  ];
  for (const [path, fields] of collections) {
    const owned = await ownedRecords(database, path, fields, uid);
    records.push(...owned);
    if (path === "posts") owned.forEach(({ path: postPath, value }) => records.push({ path: `public_posts/${postPath.split("/").pop()}`, value }));
  }
  const trashSnapshot = await database.ref(`trash_bin/${uid}`).once("value");
  trashSnapshot.forEach((child) => records.push({ path: `trash_bin/${uid}/${child.key}`, value: child.val() }));
  return records;
}

async function purgeRecords({ uid, actorUid, reason, deleteAuthUser = true }) {
  const database = getDatabase();
  const records = await collectPurgeData(database, uid);
  const mediaUrls = [...collectCloudinaryUrls(records)];
  const secret = CLOUDINARY_API_SECRET.value();
  const apiKey = CLOUDINARY_API_KEY.value();
  if (mediaUrls.length > 0 && (!secret || !apiKey)) throw new HttpsError("failed-precondition", "Cloudinary deletion secrets are not configured.");

  const deletionResults = [];
  for (const url of mediaUrls) deletionResults.push(await destroyCloudinaryUrl(url, secret, apiKey));

  const updates = {};
  records.forEach(({ path }) => { updates[path] = null; });
  updates[`purge_audit/${uid}/${Date.now()}`] = { uid, actorUid, reason, mediaCount: mediaUrls.length, completedAt: Date.now() };
  await database.ref().update(updates);
  if (deleteAuthUser) await getAuth().deleteUser(uid);
  return { uid, deletedRecords: records.length, deletedMedia: deletionResults.length };
}

const purgeUserAccount = onCall({ region: "us-central1", timeoutSeconds: 540, memory: "1GiB", secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET] }, async (request) => {
  assertAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
  const reason = typeof request.data?.reason === "string" ? request.data.reason.trim().slice(0, 300) : "Admin account purge";
  if (!uid || !reason) throw new HttpsError("invalid-argument", "A valid UID and reason are required.");
  return purgeRecords({ uid, actorUid: request.auth.uid, reason });
});

const purgeTrashPost = onCall({ region: "us-central1", timeoutSeconds: 120, secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET] }, async (request) => {
  assertAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
  const postId = typeof request.data?.postId === "string" ? request.data.postId.trim() : "";
  if (!uid || !postId) throw new HttpsError("invalid-argument", "Trash owner and post ID are required.");
  const database = getDatabase();
  const snapshot = await database.ref(`trash_bin/${uid}/${postId}`).once("value");
  if (!snapshot.exists()) throw new HttpsError("not-found", "Trash post was not found.");
  const urls = [...collectCloudinaryUrls(snapshot.val())];
  const results = [];
  const secret = CLOUDINARY_API_SECRET.value();
  const apiKey = CLOUDINARY_API_KEY.value();
  if (urls.length > 0 && (!secret || !apiKey)) throw new HttpsError("failed-precondition", "Cloudinary deletion secrets are not configured.");
  for (const url of urls) results.push(await destroyCloudinaryUrl(url, secret, apiKey));
  await database.ref(`trash_bin/${uid}/${postId}`).remove();
  await database.ref(`purge_audit/${uid}/${Date.now()}`).set({ uid, postId, actorUid: request.auth.uid, reason: "Permanent trash deletion", mediaCount: results.length, completedAt: Date.now() });
  return { uid, postId, deletedMedia: results.length };
});

const restoreTrashPost = onCall({ region: "us-central1", timeoutSeconds: 60 }, async (request) => {
  assertAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
  const postId = typeof request.data?.postId === "string" ? request.data.postId.trim() : "";
  if (!uid || !postId) throw new HttpsError("invalid-argument", "Trash owner and post ID are required.");
  const database = getDatabase();
  const trashRef = database.ref(`trash_bin/${uid}/${postId}`);
  const snapshot = await trashRef.once("value");
  if (!snapshot.exists()) throw new HttpsError("not-found", "Trash post was not found.");
  const record = snapshot.val();
  if (!record.data || typeof record.data !== "object") throw new HttpsError("failed-precondition", "Trash record is invalid.");
  await database.ref().update({ [`posts/${postId}`]: record.data, [`trash_bin/${uid}/${postId}`]: null });
  return { uid, postId, restored: true };
});

module.exports = { purgeUserAccount, purgeTrashPost, restoreTrashPost, _test: { cloudinaryPublicIdFromUrl, collectCloudinaryUrls, cloudinarySignature } };
