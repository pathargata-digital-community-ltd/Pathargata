const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEACTIVATION_GRACE_MS,
  getDeletionDueAt,
  shouldPurgeDeactivatedAccount,
  collectExpiredDeactivatedAccounts,
  buildAccountPurgeManifest,
} = require("../account-lifecycle");

test("calculates the 30-day deletion deadline", () => {
  const deactivatedAt = 1_700_000_000_000;
  assert.equal(getDeletionDueAt(deactivatedAt), deactivatedAt + DEACTIVATION_GRACE_MS);
  assert.equal(getDeletionDueAt("invalid"), null);
});

test("purges only deactivated profiles whose deadline has passed", () => {
  const now = 1_800_000_000_000;
  assert.equal(
    shouldPurgeDeactivatedAccount({ status: "deactivated", deletion_due_at: now - 1 }, now),
    true,
  );
  assert.equal(
    shouldPurgeDeactivatedAccount({ status: "deactivated", deletion_due_at: now + 1 }, now),
    false,
  );
  assert.equal(
    shouldPurgeDeactivatedAccount({ status: "user", deletion_due_at: now - 1 }, now),
    false,
  );
});

test("collects due accounts in deadline order without including active profiles", () => {
  const accounts = collectExpiredDeactivatedAccounts({
    late: { status: "deactivated", deletion_due_at: 1_700_000_000_000 },
    early: { status: "deactivated", deletion_due_at: 1_600_000_000_000 },
    active: { status: "user", deletion_due_at: 1_500_000_000_000 },
  }, 1_800_000_000_000);
  assert.deepEqual(accounts.map((account) => account.uid), ["early", "late"]);
});

test("builds a fixed private purge manifest and never assumes public content deletion", () => {
  const manifest = buildAccountPurgeManifest("user-a");
  assert.equal(manifest.authUserDeletionRequired, true);
  assert.equal(manifest.publicContentPolicy, "REQUIRES_EXPLICIT_POLICY");
  assert.ok(manifest.privatePaths.includes("users/user-a"));
  assert.ok(manifest.privatePaths.includes("pushTokens/user-a"));
  assert.deepEqual(manifest.ownedCollectionQueries[0], { path: "posts", orderByChild: "uid", equalTo: "user-a" });
  assert.ok(manifest.ownedCollectionQueries.some((query) => query.path === "stories"));
  assert.throws(() => buildAccountPurgeManifest(""), /INVALID_UID/);
});
