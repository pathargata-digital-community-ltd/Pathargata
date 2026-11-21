import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { endBefore, equalTo, get, limitToLast, orderByChild, query, ref, remove, runTransaction, set, startAt, update } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const rules = fs.readFileSync(path.resolve(process.cwd(), "database.rules.json"), "utf8");
let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  return testEnv.authenticatedContext(uid).database();
}

describe("server-side post privacy", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "pathargata-post-privacy-test",
      database: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      await set(ref(database, "users/owner"), { uid: "owner", status: "user", friends: { friend: true } });
      await set(ref(database, "users/friend"), { uid: "friend", status: "user" });
      await set(ref(database, "users/stranger"), { uid: "stranger", status: "user" });
      await set(ref(database, "posts/public-post"), { uid: "owner", privacy: "public", timestamp: 1 });
      await set(ref(database, "posts/friends-post"), { uid: "owner", privacy: "friends", timestamp: 2 });
      await set(ref(database, "posts/private-post"), { uid: "owner", privacy: "only_me", timestamp: 3 });
      await set(ref(database, "public_posts/public-post"), { uid: "owner", privacy: "public", timestamp: 1 });
      await set(ref(database, "friends_post_index/owner/friends-post"), { timestamp: 2 });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows public reads, friend reads, and owner reads while denying restricted strangers", async () => {
    await assertSucceeds(get(ref(dbFor("stranger"), "posts/public-post")));
    await assertSucceeds(get(ref(dbFor("friend"), "posts/friends-post")));
    await assertSucceeds(get(ref(dbFor("owner"), "posts/private-post")));
    await assertFails(get(ref(dbFor("stranger"), "posts/friends-post")));
    await assertFails(get(ref(dbFor("stranger"), "posts/private-post")));
    await assertFails(get(ref(dbFor("stranger"), "posts")));
  });

  it("allows the post composer to update its upload progress record", async () => {
    await assertSucceeds(set(ref(dbFor("owner"), "users/owner/post_upload"), {
      status: "uploading",
      progress: 88,
      label: "পোস্ট প্রকাশ হচ্ছে…",
      timestamp: 1_700_000_000_000,
    }));
  });

  it("allows an owner to save, hide, trash, and remove their feed post", async () => {
    const ownerDb = dbFor("owner");
    await assertSucceeds(set(ref(ownerDb, "users/owner/saved_posts/public-post"), true));
    await assertSucceeds(remove(ref(ownerDb, "users/owner/saved_posts/public-post")));
    await assertSucceeds(set(ref(ownerDb, "users/owner/hidden_posts/public-post"), true));

    const deletedAt = 1_700_000_000_000;
    await assertSucceeds(set(ref(ownerDb, "trash_bin/owner/public-post"), {
      type: "post",
      data: { uid: "owner", privacy: "public", timestamp: 1 },
      deletedBy: "owner",
      deletedAt,
      expiresAt: deletedAt + 30 * 24 * 60 * 60 * 1000,
      timestamp: deletedAt,
    }));
    await assertSucceeds(remove(ref(ownerDb, "public_posts/public-post")));
    await assertSucceeds(remove(ref(ownerDb, "posts/public-post")));
  });

  it("allows atomic deletion of an owned legacy post and all its projections", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      await set(ref(database, "posts/everyone-post"), { uid: "owner", privacy: "everyone", timestamp: 4 });
      await set(ref(database, "public_posts/everyone-post"), { uid: "owner", privacy: "everyone", timestamp: 4 });
      await set(ref(database, "friends_post_index/owner/everyone-post"), { timestamp: 4 });
      await set(ref(database, "user_post_index/owner/everyone-post"), { timestamp: 4 });
    });

    const deletedAt = 1_700_000_000_000;
    const ownerDb = dbFor("owner");
    await assertSucceeds(update(ref(ownerDb), {
      "trash_bin/owner/everyone-post": {
        type: "post",
        data: { uid: "owner", privacy: "everyone", timestamp: 4 },
        deletedBy: "owner",
        deletedAt,
        expiresAt: deletedAt + 30 * 24 * 60 * 60 * 1000,
        timestamp: deletedAt,
      },
      "posts/everyone-post": null,
      "public_posts/everyone-post": null,
      "friends_post_index/owner/everyone-post": null,
      "user_post_index/owner/everyone-post": null,
    }));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      expect((await get(ref(database, "posts/everyone-post"))).exists()).toBe(false);
      expect((await get(ref(database, "public_posts/everyone-post"))).exists()).toBe(false);
      expect((await get(ref(database, "friends_post_index/owner/everyone-post"))).exists()).toBe(false);
      expect((await get(ref(database, "user_post_index/owner/everyone-post"))).exists()).toBe(false);
      expect((await get(ref(database, "trash_bin/owner/everyone-post"))).exists()).toBe(true);
    });
  });

  it("only exposes the friends index to the owner or an accepted friend", async () => {
    await assertSucceeds(get(ref(dbFor("friend"), "friends_post_index/owner")));
    await assertFails(get(ref(dbFor("stranger"), "friends_post_index/owner")));
    await assertFails(get(ref(dbFor("stranger"), "user_post_index/owner")));
  });
  it("permits bounded friend-index and public-profile pages only within their privacy scope", async () => {
    await assertSucceeds(get(query(
      ref(dbFor("friend"), "friends_post_index/owner"),
      orderByChild("timestamp"),
      limitToLast(13),
    )));
    await assertSucceeds(get(query(
      ref(dbFor("friend"), "friends_post_index/owner"),
      orderByChild("timestamp"),
      endBefore(3, "cursor-key"),
      limitToLast(13),
    )));
    await assertFails(get(query(
      ref(dbFor("stranger"), "friends_post_index/owner"),
      orderByChild("timestamp"),
      limitToLast(13),
    )));
    await assertSucceeds(get(query(
      ref(dbFor("stranger"), "public_posts"),
      orderByChild("uid"),
      equalTo("owner"),
      limitToLast(13),
    )));
    await assertSucceeds(get(query(
      ref(dbFor("stranger"), "public_posts"),
      orderByChild("uid"),
      startAt("owner"),
      endBefore("owner", "zzzz"),
      limitToLast(13),
    )));
  });

  it("limits interaction writes to the acting user and post owner", async () => {
    await assertSucceeds(set(ref(dbFor("friend"), "posts/public-post/likes/friend"), true));
    await assertFails(set(ref(dbFor("friend"), "posts/public-post/likes/stranger"), true));

    await assertSucceeds(set(ref(dbFor("friend"), "posts/public-post/comments/comment-1"), {
      authorUid: "friend",
      text: "Hello",
      time: 1_700_000_000_000,
    }));
    await assertFails(set(ref(dbFor("stranger"), "posts/public-post/comments/comment-2"), {
      authorUid: "friend",
      text: "Spoofed",
      time: 1_700_000_000_001,
    }));
    await assertSucceeds(set(ref(dbFor("friend"), "posts/public-post/comments/comment-1/likes/friend"), true));
    await assertSucceeds(set(ref(dbFor("stranger"), "posts/public-post/comments/comment-1/likes/stranger"), true));
    await assertFails(set(ref(dbFor("friend"), "posts/public-post/comments/comment-1/likes/stranger"), true));

    await assertSucceeds(set(ref(dbFor("friend"), "posts/public-post/voters/friend"), 0));
    await assertFails(set(ref(dbFor("friend"), "posts/public-post/voters/friend"), 1));
    await assertSucceeds(set(ref(dbFor("friend"), "posts/public-post/options/0/votes"), 1));
    await assertFails(set(ref(dbFor("friend"), "posts/public-post/options/0/votes"), 99));
    await assertFails(set(ref(dbFor("stranger"), "posts/public-post/options/0/votes"), 99));
    await assertSucceeds(set(ref(dbFor("owner"), "posts/public-post/options/0/votes"), 2));
    await assertFails(set(ref(dbFor("stranger"), "posts/public-post/repostCount"), 99));
    await assertSucceeds(set(ref(dbFor("owner"), "posts/public-post/repostCount"), 1));
    await assertSucceeds(remove(ref(dbFor("owner"), "posts/public-post/comments/comment-1")));
    await assertFails(remove(ref(dbFor("stranger"), "posts/public-post/comments/comment-2")));
  });

  it("commits the first like immediately and toggles it off on the next transaction", async () => {
    const likeRef = ref(dbFor("friend"), "posts/public-post/likes/friend");
    const firstLike = await runTransaction(likeRef, (current) => current === true ? null : true);
    expect(firstLike.committed).toBe(true);
    expect(firstLike.snapshot.val()).toBe(true);

    const secondTap = await runTransaction(likeRef, (current) => current === true ? null : true);
    expect(secondTap.committed).toBe(true);
    expect(secondTap.snapshot.exists()).toBe(false);
  });
});
