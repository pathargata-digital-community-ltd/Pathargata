import { describe, expect, it } from "vitest";
import {
  createRtdbSnapshotCacheKey,
  doesRtdbCachePathMatch,
  isRtdbCacheSessionCurrent,
  isRtdbCacheFresh,
  shouldCacheRtdbQuery,
} from "../lib/rtdb-cache";

describe("isRtdbCacheFresh", () => {
  it("accepts a saved value within its TTL", () => {
    expect(isRtdbCacheFresh(9_000, 2_000, 10_000)).toBe(true);
  });

  it("rejects expired, future-dated, and non-positive TTL entries", () => {
    expect(isRtdbCacheFresh(7_999, 2_000, 10_000)).toBe(false);
    expect(isRtdbCacheFresh(10_001, 2_000, 10_000)).toBe(false);
    expect(isRtdbCacheFresh(10_000, 0, 10_000)).toBe(false);
  });
});

describe("createRtdbSnapshotCacheKey", () => {
  it("scopes the same path to distinct signed-in accounts", () => {
    expect(createRtdbSnapshotCacheKey("/users", {}, "uid-a")).not.toBe(
      createRtdbSnapshotCacheKey("/users", {}, "uid-b"),
    );
  });

  it("distinguishes different database paths", () => {
    expect(createRtdbSnapshotCacheKey("/posts", {}, "uid-a")).not.toBe(
      createRtdbSnapshotCacheKey("/notices", {}, "uid-a"),
    );
  });

  it("distinguishes different query constraints and sorts their object keys", () => {
    expect(
      createRtdbSnapshotCacheKey("/notifications/u", { limit: 10 }, "u"),
    ).not.toBe(
      createRtdbSnapshotCacheKey("/notifications/u", { limit: 20 }, "u"),
    );
    expect(createRtdbSnapshotCacheKey("/posts", { a: 1, b: 2 }, "u")).toBe(
      createRtdbSnapshotCacheKey("/posts", { b: 2, a: 1 }, "u"),
    );
  });
});

describe("doesRtdbCachePathMatch", () => {
  const publicPostsKey = createRtdbSnapshotCacheKey(
    "https://example.firebaseio.com/public_posts",
    { limit: 20 },
    "uid-a",
  );

  it("matches exact paths and parent/child paths", () => {
    expect(doesRtdbCachePathMatch(publicPostsKey, "public_posts")).toBe(true);
    expect(doesRtdbCachePathMatch(publicPostsKey, "public_posts/post-1")).toBe(true);
    expect(doesRtdbCachePathMatch(createRtdbSnapshotCacheKey("https://example.firebaseio.com/public_posts/post-1", {}, "uid-a"), "public_posts")).toBe(true);
  });

  it("does not match a path that only shares a substring", () => {
    expect(doesRtdbCachePathMatch(publicPostsKey, "posts")).toBe(false);
    expect(doesRtdbCachePathMatch(publicPostsKey, "public_posts_archive")).toBe(false);
  });
});

describe("isRtdbCacheSessionCurrent", () => {
  it("accepts only the active account and session generation", () => {
    expect(isRtdbCacheSessionCurrent("uid-a", 4, "uid-a", 4)).toBe(true);
    expect(isRtdbCacheSessionCurrent("uid-a", 4, "uid-b", 5)).toBe(false);
    expect(isRtdbCacheSessionCurrent("uid-a", 4, null, 5)).toBe(false);
    expect(isRtdbCacheSessionCurrent("uid-a", 4, "uid-a", 5)).toBe(false);
  });
});


describe("shouldCacheRtdbQuery", () => {
  it("keeps query-specific feed pages cacheable, including cursor pages", () => {
    expect(shouldCacheRtdbQuery("/public_posts", { l: 46, i: "timestamp" })).toBe(true);
    expect(shouldCacheRtdbQuery("/public_posts", { ep: 10, en: "post-1", l: 16, i: "timestamp" })).toBe(true);
  });

  it("rejects unbounded collection roots and full users snapshots", () => {
    expect(shouldCacheRtdbQuery("/public_posts", { i: "timestamp" })).toBe(false);
    expect(shouldCacheRtdbQuery("/users", { i: "sortName" })).toBe(false);
    expect(shouldCacheRtdbQuery("/users", { l: 20, i: "sortName" })).toBe(true);
    expect(shouldCacheRtdbQuery("/market_items", {})).toBe(false);
    expect(shouldCacheRtdbQuery("/users/user-1", {})).toBe(false);
    expect(shouldCacheRtdbQuery("/users/user-1/friends", {})).toBe(false);
    expect(shouldCacheRtdbQuery("/users/user-1/saved_posts", { l: 50 })).toBe(true);
  });

  it("allows small user fields and requires limits for whole post-index maps", () => {
    expect(shouldCacheRtdbQuery("/users/user-1/name", {})).toBe(true);
    expect(shouldCacheRtdbQuery("/user_post_index/user-1", {})).toBe(false);
    expect(shouldCacheRtdbQuery("/user_post_index/user-1", { l: 13, i: "timestamp" })).toBe(true);
  });
});
