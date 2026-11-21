import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { ref, set, update } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const projectId = "pathargata-rules-test";
const rules = fs.readFileSync(
  path.resolve(process.cwd(), "database.rules.json"),
  "utf8",
);

let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  const claims = uid.startsWith("admin") ? { admin: true } : {};
  return testEnv.authenticatedContext(uid, claims).database();
}

const notification = (overrides: Record<string, unknown> = {}) => ({
  type: "like",
  fromUid: "user-b",
  fromName: "User B",
  postId: "post-a",
  postPreview: "A post",
  timestamp: 1_700_000_000_000,
  read: false,
  ...overrides,
});

describe("Realtime Database notification rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      database: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      await set(ref(database, "users/user-a"), {
        uid: "user-a",
        role: "user",
        status: "user",
      });
      await set(ref(database, "users/user-b"), {
        uid: "user-b",
        role: "user",
        status: "user",
      });
      await set(ref(database, "posts/post-a"), {
        uid: "user-a",
        type: "text",
        timestamp: 1_700_000_000_000,
      });
      await set(ref(database, "posts/post-b"), {
        uid: "user-b",
        type: "text",
        timestamp: 1_700_000_000_000,
      });
      await set(ref(database, "user_chats/user-a/user-b"), {
        name: "User B",
      });
      await set(ref(database, "user_chats/user-b/user-a"), {
        name: "User A",
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows a post actor to notify the post owner about a like or comment", async () => {
    await assertSucceeds(
      set(
        ref(dbFor("user-b"), "notifications/user-a/like-1"),
        notification(),
      ),
    );
  });

  it("allows a post author to create a post-tag notification", async () => {
    await assertSucceeds(
      set(
        ref(dbFor("user-b"), "notifications/user-a/tag-1"),
        notification({ type: "post_tag", fromUid: "user-b", postId: "post-b" }),
      ),
    );
  });

  it("allows a reposter to notify the original post owner", async () => {
    await assertSucceeds(
      set(
        ref(dbFor("user-b"), "notifications/user-a/repost-1"),
        notification({ type: "repost", fromUid: "user-b" }),
      ),
    );
  });

  it("allows a chat participant to notify the other participant", async () => {
    await assertSucceeds(
      set(
        ref(dbFor("user-b"), "notifications/user-a/chat-1"),
        notification({ type: "chat", fromUid: "user-b", postId: null }),
      ),
    );
  });

  it("denies spoofed actors, invalid types, and unrelated chat recipients", async () => {
    await assertFails(
      set(
        ref(dbFor("user-b"), "notifications/user-a/spoof-1"),
        notification({ fromUid: "user-c" }),
      ),
    );
    await assertFails(
      set(
        ref(dbFor("user-b"), "notifications/user-a/fake-1"),
        notification({ type: "admin_alert" }),
      ),
    );
    await assertFails(
      set(
        ref(dbFor("user-b"), "notifications/user-c/chat-1"),
        notification({ type: "chat", fromUid: "user-b", postId: null }),
      ),
    );
  });

  it("lets only the recipient change the read flag on an existing notification", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(
        ref(context.database(), "notifications/user-a/like-2"),
        notification(),
      );
    });

    await assertSucceeds(
      update(ref(dbFor("user-a"), "notifications/user-a/like-2"), {
        read: true,
      }),
    );
    await assertFails(
      update(ref(dbFor("user-b"), "notifications/user-a/like-2"), {
        read: false,
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "notifications/user-a/like-2"), {
        type: "admin_alert",
      }),
    );
  });
});
