const { getDatabase } = require("firebase-admin/database");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

const SNAPSHOT_ROOT = "super_admin_rollback_snapshots";
const APPROVAL_ROOT = "super_admin_approval_requests";
const AUDIT_ROOT = "super_admin_audit";
const APPROVAL_TTL_MS = 30 * 60 * 1000;
const MAX_REASON_LENGTH = 300;
const MAX_STATE_LENGTH = 12_000;
const TARGETS = new Set([
  "admin_settings/app_maintenance",
  "admin_settings/ai_assistant",
  "admin_settings/feature_flags",
  "admin_settings/emergency_controls",
  "marketplace_controls",
]);
const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected", "cancelled", "expired", "applied", "rolled_back"]);

function requireSuperAdmin(request) {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin sign-in required.");
  if (auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Admin custom claim required.");
  }
  return auth.uid;
}

function cleanReason(value) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > MAX_REASON_LENGTH) {
    throw new HttpsError("invalid-argument", "A bounded reason is required.");
  }
  return reason;
}

function parseState(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `${fieldName} must be an object.`);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_STATE_LENGTH) {
    throw new HttpsError("invalid-argument", `${fieldName} is too large.`);
  }
  return value;
}

function targetPath(value) {
  if (typeof value !== "string" || !TARGETS.has(value)) {
    throw new HttpsError("invalid-argument", "Sensitive target path is not allowlisted.");
  }
  return value;
}

function pushKey(database, root) {
  const key = database.ref(root).push().key;
  if (!key) throw new HttpsError("internal", "Could not allocate a secure request ID.");
  return key;
}

function snapshotRecord({ snapshotId, target, before, after, requesterUid, createdAt, reason, requestId, status }) {
  if (!APPROVAL_STATUSES.has(status)) throw new Error("invalid snapshot status");
  return {
    snapshotId,
    targetPath: target,
    beforeState: JSON.stringify(before ?? null),
    requestedAfterState: JSON.stringify(after ?? null),
    requesterUid,
    createdAt,
    reason,
    requestId,
    status,
  };
}

function auditRecord({ actorUid, action, target, before, after, reason, requestId, snapshotId, result, timestamp }) {
  return {
    actorUid,
    action,
    target,
    before: JSON.stringify(before ?? null),
    after: JSON.stringify(after ?? null),
    reason,
    requestId,
    snapshotId: snapshotId || null,
    timestamp,
    result,
  };
}

async function requestChangeHandler(request) {
  const requesterUid = requireSuperAdmin(request);
  const database = getDatabase();
  const target = targetPath(request.data?.targetPath);
  const requestedAfterState = parseState(request.data?.requestedAfterState, "requestedAfterState");
  const reason = cleanReason(request.data?.reason);
  const now = Date.now();
  const requestId = pushKey(database, APPROVAL_ROOT);
  const snapshotId = pushKey(database, SNAPSHOT_ROOT);
  const auditId = pushKey(database, AUDIT_ROOT);
  const before = (await database.ref(target).get()).val() ?? null;
  const approval = {
    requestId,
    targetPath: target,
    requestedAfterState: JSON.stringify(requestedAfterState),
    requesterUid,
    requestedAt: now,
    createdAt: now,
    expiresAt: now + APPROVAL_TTL_MS,
    reason,
    status: "pending",
    snapshotId,
  };
  const snapshot = snapshotRecord({
    snapshotId,
    target,
    before,
    after: requestedAfterState,
    requesterUid,
    createdAt: now,
    reason,
    requestId,
    status: "pending",
  });
  const audit = auditRecord({
    actorUid: requesterUid,
    action: "sensitive_change_requested",
    target,
    before,
    after: requestedAfterState,
    reason,
    requestId,
    snapshotId,
    result: "pending",
    timestamp: now,
  });
  await database.ref().update({
    [`${APPROVAL_ROOT}/${requestId}`]: approval,
    [`${SNAPSHOT_ROOT}/${snapshotId}`]: snapshot,
    [`${AUDIT_ROOT}/${auditId}`]: audit,
  });
  return { requestId, snapshotId, status: "pending" };
}

async function decideApprovalHandler(request) {
  const approverUid = requireSuperAdmin(request);
  const requestId = typeof request.data?.requestId === "string" ? request.data.requestId : "";
  const decision = typeof request.data?.decision === "string" ? request.data.decision : "";
  if (!requestId || !["approved", "rejected", "cancelled", "expired"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Invalid approval decision.");
  }
  const reason = cleanReason(request.data?.reason);
  const database = getDatabase();
  const approvalRef = database.ref(`${APPROVAL_ROOT}/${requestId}`);
  const current = (await approvalRef.get()).val();
  if (!current || current.status !== "pending") throw new HttpsError("failed-precondition", "Approval is no longer pending.");
  if (decision === "expired" && Date.now() < Number(current.expiresAt || current.createdAt || 0)) {
    throw new HttpsError("failed-precondition", "Approval TTL has not elapsed.");
  }
  if (decision === "cancelled" && current.requesterUid !== approverUid) {
    throw new HttpsError("permission-denied", "Only the requester can cancel this request.");
  }
  const claimed = await approvalRef.transaction((value) => {
    if (!value || value.status !== "pending") return;
    return { ...value, status: decision, approverUid: decision === "cancelled" ? null : approverUid, decidedAt: Date.now(), decisionReason: reason };
  });
  if (!claimed.committed) throw new HttpsError("aborted", "Approval was changed by another reviewer.");
  const updated = claimed.snapshot.val();
  const now = Date.now();
  const auditId = pushKey(database, AUDIT_ROOT);
  const updates = {
    [`${AUDIT_ROOT}/${auditId}`]: auditRecord({
      actorUid: approverUid,
      action: `approval_${decision}`,
      target: `${APPROVAL_ROOT}/${requestId}`,
      before: current,
      after: updated,
      reason,
      requestId,
      snapshotId: current.snapshotId,
      result: decision,
      timestamp: now,
    }),
  };
  if (decision === "approved") {
    const payload = JSON.parse(current.requestedAfterState || "null");
    const target = targetPath(current.targetPath);
    const before = (await database.ref(target).get()).val() ?? null;
    const appliedSnapshotId = pushKey(database, SNAPSHOT_ROOT);
    const appliedAuditId = pushKey(database, AUDIT_ROOT);
    const finalPayload = { ...payload, approvalId: requestId, requestedBy: current.requesterUid, approvedBy: approverUid, approvalStatus: "approved", approvedAt: now, updatedAt: now, updatedBy: approverUid };
    updates[target] = finalPayload;
    updates[`${SNAPSHOT_ROOT}/${appliedSnapshotId}`] = snapshotRecord({ snapshotId: appliedSnapshotId, target, before, after: finalPayload, requesterUid: current.requesterUid, createdAt: now, reason: current.reason, requestId, status: "applied" });
    updates[`${AUDIT_ROOT}/${appliedAuditId}`] = auditRecord({ actorUid: approverUid, action: "sensitive_change_applied", target, before, after: finalPayload, reason, requestId, snapshotId: appliedSnapshotId, result: "applied", timestamp: now });
    updates[`${APPROVAL_ROOT}/${requestId}/status`] = "applied";
    updates[`${APPROVAL_ROOT}/${requestId}/appliedAt`] = now;
  }
  await database.ref().update(updates);
  return { requestId, status: decision === "approved" ? "applied" : decision };
}

async function rollbackHandler(request) {
  const requesterUid = requireSuperAdmin(request);
  const snapshotId = typeof request.data?.snapshotId === "string" ? request.data.snapshotId : "";
  const reason = cleanReason(request.data?.reason);
  if (!snapshotId) throw new HttpsError("invalid-argument", "snapshotId is required.");
  const database = getDatabase();
  const source = (await database.ref(`${SNAPSHOT_ROOT}/${snapshotId}`).get()).val();
  if (!source || source.status !== "applied") throw new HttpsError("failed-precondition", "Only an applied snapshot can be rolled back.");
  const target = targetPath(source.targetPath);
  const before = (await database.ref(target).get()).val() ?? null;
  const restore = JSON.parse(source.beforeState || "null");
  const requestId = pushKey(database, APPROVAL_ROOT);
  const rollbackSnapshotId = pushKey(database, SNAPSHOT_ROOT);
  const auditId = pushKey(database, AUDIT_ROOT);
  const now = Date.now();
  await database.ref().update({
    [`${APPROVAL_ROOT}/${requestId}`]: { requestId, operation: "rollback", sourceSnapshotId: snapshotId, targetPath: target, requestedAfterState: JSON.stringify(restore), requesterUid, requestedAt: now, createdAt: now, expiresAt: now + APPROVAL_TTL_MS, reason, status: "pending", snapshotId: rollbackSnapshotId },
    [`${SNAPSHOT_ROOT}/${rollbackSnapshotId}`]: snapshotRecord({ snapshotId: rollbackSnapshotId, target, before, after: restore, requesterUid, createdAt: now, reason, requestId, status: "pending" }),
    [`${AUDIT_ROOT}/${auditId}`]: auditRecord({ actorUid: requesterUid, action: "rollback_requested", target, before, after: restore, reason, requestId, snapshotId: rollbackSnapshotId, result: "pending", timestamp: now }),
  });
  return { requestId, snapshotId: rollbackSnapshotId, status: "pending" };
}

exports.requestSuperAdminChange = onCall({ region: "us-central1" }, requestChangeHandler);
exports.decideSuperAdminApproval = onCall({ region: "us-central1" }, decideApprovalHandler);
exports.requestSuperAdminRollback = onCall({ region: "us-central1" }, rollbackHandler);
exports._test = { cleanReason, targetPath, parseState, snapshotRecord, auditRecord, TARGETS, requireSuperAdmin };
