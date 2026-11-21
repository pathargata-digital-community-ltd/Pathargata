import { describe, expect, it } from "vitest";
import { prepareLegacyDataBackfill } from "../scripts/prepare-legacy-data-backfill.mjs";

describe("legacy data backfill planner", () => {
  it("projects users and indexes posts without exposing private profile fields", () => {
    const plan = prepareLegacyDataBackfill({
      users: {
        owner: {
          uid: "owner",
          name: "Owner",
          email: "private@example.test",
          phone: "01700000000",
          status: "user",
          settings: { profileVisibility: "everyone", tagPermission: "friends" },
        },
        deleted: { uid: "deleted", name: "Deleted", status: "deleted" },
      },
      posts: {
        publicPost: { uid: "owner", privacy: "public", timestamp: 3, content: "public" },
        friendsPost: { uid: "owner", privacy: "friends", timestamp: 2, content: "friends" },
        privatePost: { uid: "owner", privacy: "only_me", timestamp: 1, content: "private" },
        ambiguousPost: { uid: "owner", timestamp: 0, content: "ambiguous" },
        orphanPost: { uid: "missing-user", privacy: "public", timestamp: 0, content: "orphan" },
      },
    });

    expect(plan.dryRun).toBe(true);
    expect(plan.peopleProjectionCount).toBe(1);
    expect(plan.deletedUserProjectionCount).toBe(1);
    expect(plan.publicPostCount).toBe(1);
    expect(plan.ownIndexCount).toBe(4);
    expect(plan.friendsIndexCount).toBe(1);
    const applyUpdates = plan.applyUpdates as Record<string, unknown>;
    expect(applyUpdates["people_index/owner"]).not.toHaveProperty("email");
    expect(applyUpdates["people_index/owner"]).not.toHaveProperty("phone");
    expect(applyUpdates["public_posts/publicPost"]).toBeDefined();
    expect(applyUpdates["public_posts/friendsPost"]).toBeUndefined();
    expect(applyUpdates["public_posts/privatePost"]).toBeUndefined();
    expect(applyUpdates["public_posts/ambiguousPost"]).toBeUndefined();
    expect(applyUpdates["public_posts/orphanPost"]).toBeUndefined();
    expect(applyUpdates["friends_post_index/owner/friendsPost"]).toEqual({ timestamp: 2 });
    expect(applyUpdates["user_post_index/owner/privatePost"]).toEqual({ timestamp: 1 });
    expect(applyUpdates["user_post_index/owner/ambiguousPost"]).toEqual({ timestamp: 0 });
  });

  it("preserves existing projections in rollback updates and never mutates source posts", () => {
    const source = {
      users: { owner: { uid: "owner", name: "Owner", status: "user" } },
      posts: { post1: { uid: "owner", privacy: "public", timestamp: 1, content: "source" } },
      people_index: { owner: { uid: "owner", name: "Old" } },
      public_posts: { post1: { uid: "owner", privacy: "public", timestamp: 0 } },
    };
    const before = JSON.stringify(source);
    const plan = prepareLegacyDataBackfill(source);
    const rollbackUpdates = plan.rollbackUpdates as Record<string, unknown>;

    expect(JSON.stringify(source)).toBe(before);
    expect(rollbackUpdates["people_index/owner"]).toEqual({ uid: "owner", name: "Old" });
    expect(rollbackUpdates["public_posts/post1"]).toEqual({ uid: "owner", privacy: "public", timestamp: 0 });
    expect(plan.safety.sourcePostsNeverModified).toBe(true);
  });
});
