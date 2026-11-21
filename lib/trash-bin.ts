import { get, ref, update } from "firebase/database";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { invalidateRtdbSnapshotCache } from "@/lib/rtdb-cache";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type TrashPostRecord = {
  type?: "post";
  data?: Record<string, any>;
  deletedBy?: string;
  deletedAt?: number;
  expiresAt?: number;
  timestamp?: number;
};

export function trashPostPath(uid: string, postId: string) {
  return `trash_bin/${uid}/${postId}`;
}

export function buildTrashRecord(data: Record<string, any>, uid: string, now = Date.now()): TrashPostRecord {
  return {
    type: "post",
    data,
    deletedBy: uid,
    deletedAt: now,
    expiresAt: now + TRASH_RETENTION_MS,
    timestamp: now,
  };
}

export async function restoreTrashPost(postId: string, record: TrashPostRecord) {
  const uid = pathargataAuth.currentUser?.uid;
  const data = record.data;
  if (!uid || record.deletedBy !== uid || !data || data.uid !== uid) throw new Error("TRASH_PERMISSION_DENIED");
  if (!record.expiresAt || record.expiresAt <= Date.now()) throw new Error("TRASH_EXPIRED");

  const restoredData = { ...data, privacy: data.privacy || "public" };
  const privacy = String(restoredData.privacy).toLowerCase();
  const updates: Record<string, unknown> = {
    [`posts/${postId}`]: restoredData,
    [trashPostPath(uid, postId)]: null,
    [`user_post_index/${uid}/${postId}`]: { timestamp: Number(data.timestamp) || Date.now() },
  };
  if (["public", "everyone"].includes(privacy)) {
    updates[`public_posts/${postId}`] = restoredData;
  }
  if (["friends", "friends_only", "friends-only"].includes(privacy)) {
    updates[`friends_post_index/${uid}/${postId}`] = { timestamp: Number(data.timestamp) || Date.now() };
  }

  await update(ref(pathargataDb), updates);
  await invalidateRtdbSnapshotCache([
    `posts/${postId}`,
    "posts",
    `public_posts/${postId}`,
    "public_posts",
    `user_post_index/${uid}`,
    `friends_post_index/${uid}`,
    `trash_bin/${uid}`,
  ]);
}

export async function deleteOwnPost(postId: string, uid: string) {
  const snapshot = await get(ref(pathargataDb, `posts/${postId}`));
  const post = snapshot.val() as Record<string, any> | null;
  if (!post || post.uid !== uid || pathargataAuth.currentUser?.uid !== uid) {
    throw new Error("POST_PERMISSION_DENIED");
  }

  const updates: Record<string, unknown> = {
    [trashPostPath(uid, postId)]: buildTrashRecord(post, uid),
    [`posts/${postId}`]: null,
    [`public_posts/${postId}`]: null,
    [`friends_post_index/${uid}/${postId}`]: null,
    [`user_post_index/${uid}/${postId}`]: null,
  };
  await update(ref(pathargataDb), updates);
  await invalidateRtdbSnapshotCache([
    `posts/${postId}`,
    "posts",
    `public_posts/${postId}`,
    "public_posts",
    `friends_post_index/${uid}`,
    `user_post_index/${uid}`,
    `trash_bin/${uid}`,
  ]);
}

export async function loadTrashPosts(uid: string) {
  const snapshot = await get(ref(pathargataDb, `trash_bin/${uid}`));
  const raw = (snapshot.val() || {}) as Record<string, TrashPostRecord>;
  return Object.entries(raw)
    .map(([id, value]) => ({ id, ...value }))
    .filter((item) => item.type === "post" && item.data && item.deletedBy === uid)
    .sort((a, b) => (Number(b.deletedAt || b.timestamp) || 0) - (Number(a.deletedAt || a.timestamp) || 0));
}
