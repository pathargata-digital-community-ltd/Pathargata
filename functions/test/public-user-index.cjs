const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPublicUserIndex } = require("../public-user-index");

test("builds a bounded public projection without private fields", () => {
  const projection = buildPublicUserIndex({
    uid: "user-a",
    name: "User A",
    nickname: "A",
    profile_pic: "https://example.com/a.jpg",
    cover_pic: "https://example.com/cover.jpg",
    union: "Union",
    village: "Village",
    profession: "Teacher",
    isVerified: true,
    phone: "private",
    email: "private@example.com",
    nid: "private",
    verificationStatus: "approved",
    settings: { tagPermission: "friends", profileVisibility: "everyone" },
  }, "user-a");

  assert.deepEqual(projection, {
    uid: "user-a",
    name: "User A",
    nickname: "A",
    profile_pic: "https://example.com/a.jpg",
    cover_pic: "https://example.com/cover.jpg",
    union: "Union",
    village: "Village",
    profession: "Teacher",
    isVerified: true,
    tagPermission: "friends",
    sortName: "user a",
    searchName: "user a a union village teacher",
    profileVisibility: "everyone",
  });
  assert.equal("phone" in projection, false);
  assert.equal("email" in projection, false);
  assert.equal("settings" in projection, false);
  assert.equal("nid" in projection, false);
  assert.equal("verificationStatus" in projection, false);
});

test("does not publish deleted users", () => {
  assert.equal(buildPublicUserIndex({ name: "Deleted", status: "deleted" }, "user-a"), null);
  assert.equal(buildPublicUserIndex({ name: "Deactivated", status: "deactivated" }, "user-b"), null);
});

test("does not publish users without explicit profile visibility consent", () => {
  assert.equal(
    buildPublicUserIndex({ name: "Private", settings: { tagPermission: "everyone" } }, "user-c"),
    null,
  );
  assert.equal(
    buildPublicUserIndex({ name: "Hidden", settings: { profileVisibility: "none" } }, "user-d"),
    null,
  );
});
