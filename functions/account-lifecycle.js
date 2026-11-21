const DEACTIVATION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

function getDeletionDueAt(deactivatedAt) {
  const timestamp = Number(deactivatedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp + DEACTIVATION_GRACE_MS;
}

function shouldPurgeDeactivatedAccount(profile, now = Date.now()) {
  if (!profile || profile.status !== "deactivated") return false;
  const dueAt = Number(profile.deletion_due_at) || getDeletionDueAt(profile.deactivated_at);
  return Number.isFinite(dueAt) && dueAt <= now;
}

function collectExpiredDeactivatedAccounts(usersByUid, now = Date.now()) {
  if (!usersByUid || typeof usersByUid !== "object") return [];
  return Object.entries(usersByUid)
    .filter(([, profile]) => shouldPurgeDeactivatedAccount(profile, now))
    .map(([uid, profile]) => ({
      uid,
      deletionDueAt: Number(profile.deletion_due_at) || getDeletionDueAt(profile.deactivated_at),
    }))
    .sort((a, b) => a.deletionDueAt - b.deletionDueAt);
}

function buildAccountPurgeManifest(uid) {
  if (typeof uid !== "string" || !uid.trim()) throw new Error("INVALID_UID");
  return {
    uid,
    privatePaths: [
      `users/${uid}`,
      `people_index/${uid}`,
      `pushTokens/${uid}`,
      `status/${uid}`,
      `user_chats/${uid}`,
      `user_blocks/${uid}`,
      `notifications/${uid}`,
      `account_lifecycle_requests/${uid}`,
      `account_deletion_requests/${uid}`,
    ],
    ownedCollectionQueries: [
      { path: "posts", orderByChild: "uid", equalTo: uid },
      { path: "stories", orderByChild: "uid", equalTo: uid },
      { path: "complaints", orderByChild: "uid", equalTo: uid },
      { path: "blood_requests", orderByChild: "requesterUid", equalTo: uid },
      { path: "market_shops", orderByChild: "uid", equalTo: uid },
      { path: "market_items", orderByChild: "uid", equalTo: uid },
      { path: "service_requests", orderByChild: "uid", equalTo: uid },
    ],
    authUserDeletionRequired: true,
    publicContentPolicy: "REQUIRES_EXPLICIT_POLICY",
  };
}

module.exports = {
  DEACTIVATION_GRACE_MS,
  getDeletionDueAt,
  shouldPurgeDeactivatedAccount,
  collectExpiredDeactivatedAccounts,
  buildAccountPurgeManifest,
};
