const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../admin-controls");

test("accepts an authenticated admin custom claim", () => {
  assert.equal(
    _test.requireSuperAdmin({ auth: { uid: "admin-1", token: { admin: true } } }),
    "admin-1",
  );
});

test("rejects the legacy email-only identity", () => {
  assert.throws(
    () => _test.requireSuperAdmin({ auth: { uid: "legacy-admin", token: { email: "admin@gmail.com" } } }),
    (error) => error?.code === "permission-denied",
  );
});

test("rejects an authenticated user without the admin claim", () => {
  assert.throws(
    () => _test.requireSuperAdmin({ auth: { uid: "user-1", token: {} } }),
    (error) => error?.code === "permission-denied",
  );
});
