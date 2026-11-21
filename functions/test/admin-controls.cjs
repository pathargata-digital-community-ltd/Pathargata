const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../admin-controls");

test("only allowlisted sensitive targets are accepted", () => {
  assert.equal(_test.targetPath("admin_settings/feature_flags"), "admin_settings/feature_flags");
  assert.throws(() => _test.targetPath("users/admin-1"), /allowlisted/);
});

test("reasons and states are bounded and object-shaped", () => {
  assert.equal(_test.cleanReason("  emergency maintenance  "), "emergency maintenance");
  assert.throws(() => _test.cleanReason(""), /reason/);
  assert.throws(() => _test.parseState("not-an-object", "state"), /object/);
  assert.deepEqual(_test.parseState({ enabled: true }, "state"), { enabled: true });
});

test("snapshot contract includes the immutable rollback fields", () => {
  const snapshot = _test.snapshotRecord({
    snapshotId: "snap-1",
    target: "admin_settings/feature_flags",
    before: { postCreation: true },
    after: { postCreation: false },
    requesterUid: "admin-a",
    createdAt: 1700000000000,
    reason: "incident response",
    requestId: "req-1",
    status: "pending",
  });
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "beforeState", "createdAt", "reason", "requestId", "requestedAfterState", "requesterUid", "snapshotId", "status", "targetPath",
  ].sort());
  assert.equal(JSON.parse(snapshot.beforeState).postCreation, true);
});
