import { describe, expect, it } from "vitest";
import { filterEligibleFeedPosts, rankCommunityPosts, type RankablePost } from "../lib/feed-ranking";
import type { FeedPreferences } from "../lib/feed-preferences";

const now = 1_800_000_000_000;
function post(id: string, overrides: Partial<RankablePost> = {}): RankablePost {
  return { id, uid: `author-${id}`, timestamp: now, likeCount: 0, commentCount: 0, ...overrides };
}
const emptyPrefs: FeedPreferences = { version: 1, updatedAt: now, topics: {}, authors: {}, types: {} };

describe("rankCommunityPosts", () => {
  it("is deterministic, fresh and engagement-aware without random shuffling", () => {
    const candidates = [
      post("fresh", { timestamp: now }),
      post("old", { timestamp: now - 8 * 24 * 60 * 60 * 1000, likeCount: 4_000, commentCount: 500 }),
      post("popular", { timestamp: now, likeCount: 80, commentCount: 12 }),
    ];
    const first = rankCommunityPosts(candidates, {}, new Set(), now).map((item) => item.id);
    const second = rankCommunityPosts(candidates, {}, new Set(), now).map((item) => item.id);
    expect(first).toEqual(second);
    expect(first[0]).toBe("popular");
    expect(first).toContain("old");
  });

  it("personalizes toward topics, authors and post types the user chose to engage with", () => {
    const candidates = [
      post("edu", { uid: "teacher", title: "Education scholarship for students", type: "education" }),
      post("market", { uid: "shop", title: "Fresh vegetables at the local market", type: "market" }),
    ];
    const preferences: FeedPreferences = {
      ...emptyPrefs,
      topics: { education: 7, scholarship: 5, vegetables: -3 },
      authors: { teacher: 5 },
      types: { education: 6 },
    };
    const ranked = rankCommunityPosts(candidates, { preferences }, new Set(), now);
    expect(ranked[0].id).toBe("edu");
  });

  it("adds modest local, friend and trusted-publisher relevance", () => {
    const candidates = [
      post("ordinary"),
      post("friend", { uid: "friend-uid" }),
      post("nearby", { village: "North Village" }),
      post("journalist", { authorRole: "journalist", authorVerified: true }),
    ];
    const ranked = rankCommunityPosts(candidates, { village: "North Village" }, new Set(["friend-uid"]), now);
    expect(ranked.slice(0, 3).map((item) => item.id)).toEqual(expect.arrayContaining(["friend", "nearby", "journalist"]));
  });

  it("caps adminScore and uses author/topic diversity to prevent feed monopolies", () => {
    const candidates = [
      post("viral", { uid: "repeat", likeCount: 100, adminScore: 1_000_000 }),
      post("repeat-2", { uid: "repeat", likeCount: 90 }),
      post("other-author", { uid: "other", likeCount: 60 }),
      post("other-topic", { uid: "third", title: "Education community update", type: "education" }),
    ];
    const first = rankCommunityPosts(candidates, {}, new Set(), now);
    expect(first[0].id).toBe("viral");
    expect(first[1].id).not.toBe("repeat-2");
    expect(rankCommunityPosts(candidates, {}, new Set(), now).map((item) => item.id)).toEqual(first.map((item) => item.id));
  });
});

describe("filterEligibleFeedPosts", () => {
  it("excludes expired/hidden/private posts while preserving public posts and allowed friends-only posts", () => {
    const candidates = [
      post("public"),
      post("hidden"),
      post("expired", { expiresAt: now - 1 }),
      post("private", { privacy: "only_me", uid: "stranger" }),
      post("mine", { privacy: "only_me", uid: "viewer" }),
      post("friend-only", { privacy: "friends", uid: "friend" }),
      post("stranger-friends-only", { privacy: "friends", uid: "stranger" }),
    ];
    const visible = filterEligibleFeedPosts(candidates, { uid: "viewer", hiddenPostIds: new Set(["hidden"]) }, new Set(["friend"]), now);
    expect(visible.map((item) => item.id).sort()).toEqual(["friend-only", "mine", "public"].sort());
  });

  it("excludes every post authored by a deactivated account", () => {
    const visible = filterEligibleFeedPosts(
      [post("active", { uid: "active-user" }), post("inactive", { uid: "inactive-user" })],
      { deactivatedAuthorIds: new Set(["inactive-user"]) },
      new Set(),
      now,
    );
    expect(visible.map((item) => item.id)).toEqual(["active"]);
  });
});
