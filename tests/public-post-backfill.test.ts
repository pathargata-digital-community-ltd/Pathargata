import { describe, expect, it } from "vitest";
import { preparePublicPostBackfill } from "../scripts/prepare-public-post-backfill.mjs";

describe("public post backfill planner", () => {
  it("creates a bounded, reversible plan without changing private posts", () => {
    const plan = preparePublicPostBackfill({
      posts: {
        publicPost: { uid: "user-a", privacy: "public", timestamp: 3 },
        friendsPost: { uid: "user-a", privacy: "friends", timestamp: 4 },
        privatePost: { uid: "user-a", privacy: "only_me", timestamp: 5 },
      },
      public_posts: {
        publicPost: { uid: "user-a", privacy: "public", timestamp: 1 },
        stalePost: { uid: "user-a", privacy: "public", timestamp: 0 },
      },
    });

    expect(plan.dryRun).toBe(true);
    expect(plan.sourcePostCount).toBe(3);
    expect(plan.expectedPublicProjectionCount).toBe(1);
    expect(plan.excludedPrivateCount).toBe(2);
    const applyUpdates = plan.applyUpdates as Record<string, unknown>;
    const rollbackUpdates = plan.rollbackUpdates as Record<string, unknown>;
    expect(applyUpdates["public_posts/publicPost"]).toMatchObject({
      uid: "user-a",
      privacy: "public",
      timestamp: 3,
      likeCount: 0,
      commentCount: 0,
      images: [],
      commentPreviews: [],
    });
    expect(applyUpdates["public_posts/publicPost"]).not.toHaveProperty("likes");
    expect(applyUpdates["public_posts/publicPost"]).not.toHaveProperty("comments");
    expect(applyUpdates["public_posts/publicPost"]).not.toHaveProperty("voters");
    expect(rollbackUpdates["public_posts/publicPost"]).toEqual({
      uid: "user-a",
      privacy: "public",
      timestamp: 1,
    });
    expect(rollbackUpdates["public_posts/stalePost"]).toBeUndefined();
    expect(applyUpdates["public_posts/privatePost"]).toBeUndefined();
  });
});
