const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../media-purge");

test("extracts Cloudinary public IDs and ignores untrusted URLs", () => {
  assert.equal(_test.cloudinaryPublicIdFromUrl("https://res.cloudinary.com/dl1auoanl/image/upload/v123/pathargata/users/u1/avatar.jpg"), "pathargata/users/u1/avatar");
  assert.equal(_test.cloudinaryPublicIdFromUrl("https://example.com/avatar.jpg"), null);
  assert.equal(_test.cloudinaryPublicIdFromUrl("https://res.cloudinary.com/dl1auoanl/image/upload/pathargata/raw"), "pathargata/raw");
});

test("collects only Cloudinary URLs recursively and deduplicates them", () => {
  const result = [..._test.collectCloudinaryUrls({
    profile_pic: "https://res.cloudinary.com/demo/image/upload/v1/profile/u.jpg",
    images: ["https://res.cloudinary.com/demo/image/upload/v1/profile/u.jpg", "https://res.cloudinary.com/demo/image/upload/posts/p.png"],
    text: "https://example.com/not-cloudinary.png",
  })];
  assert.equal(result.length, 2);
  assert.ok(result.some((value) => value.includes("profile/u.jpg")));
});

test("builds a stable Cloudinary signature from sorted parameters", () => {
  const first = _test.cloudinarySignature({ timestamp: 1700000000, public_id: "posts/p1" }, "secret");
  const second = _test.cloudinarySignature({ public_id: "posts/p1", timestamp: 1700000000 }, "secret");
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{40}$/);
});
