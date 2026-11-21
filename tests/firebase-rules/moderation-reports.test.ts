import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";
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

const messageReport = { reason: "user_report", timestamp: 1_700_000_000_000 };
const userReport = { reason: "chat_report", timestamp: 1_700_000_000_000 };
const marketReport = {
  uid: "user-a",
  productId: "item-1",
  reason: "Misleading product",
  time: 1_700_000_000_000,
  status: "open",
};
const commentReport = {
  reporterUid: "user-a",
  reporterName: "User A",
  postId: "post-1",
  commentId: "comment-1",
  timestamp: 1_700_000_000_000,
  status: "Pending",
};

describe("Realtime Database moderation report rules", () => {
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
      for (const uid of ["user-a", "user-b"]) {
        await set(ref(database, `users/${uid}`), {
          uid,
          role: "user",
          status: "user",
        });
      }
      await set(ref(database, "users/admin-1"), {
        uid: "admin-1",
        role: "admin",
        status: "user",
      });
      await set(ref(database, "posts/post-1"), {
        uid: "user-b",
        comments: { "comment-1": { uid: "user-b", text: "Comment" } },
      });
      await set(ref(database, "market_items/item-1"), {
        uid: "user-b",
        title: "Product",
      });
      await set(ref(database, "chats/user-a_user-b/message-1"), {
        sender: "user-b",
        timestamp: 1_700_000_000_000,
        status: "sent",
      });
      await set(ref(database, "chat_members/user-a_user-b/user-a"), true);
      await set(ref(database, "chat_members/user-a_user-b/user-b"), true);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows admin reads and denies regular user reads across all report paths", async () => {
    for (const pathName of ["message_reports", "user_reports", "market_reports", "reported_comments"]) {
      await assertSucceeds(get(ref(dbFor("admin-1"), pathName)));
      await assertFails(get(ref(dbFor("user-a"), pathName)));
    }
  });

  it("allows valid authenticated reports with existing targets", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "message_reports/user-a_user-b/message-1/user-a"), messageReport),
    );
    await assertSucceeds(
      set(ref(dbFor("user-a"), "user_reports/user-b/user-a"), userReport),
    );
    await assertSucceeds(
      set(ref(dbFor("user-a"), "market_reports/item-1/user-a"), marketReport),
    );
    await assertSucceeds(
      set(ref(dbFor("user-a"), "reported_comments/report-1"), commentReport),
    );
  });

  it("denies reporter spoofing, missing targets, and duplicate report keys", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "message_reports/user-a_user-b/message-1/user-b"), messageReport),
    );
    await assertSucceeds(
      set(ref(dbFor("user-a"), "user_reports/user-b/user-a"), userReport),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "user_reports/user-b/user-a"), userReport),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "market_reports/missing-item/user-a"), {
        ...marketReport,
        productId: "missing-item",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "reported_comments/report-2"), {
        ...commentReport,
        reporterUid: "user-b",
      }),
    );
  });

  it("allows admin moderation updates without granting regular user updates", async () => {
    await set(ref(dbFor("user-a"), "market_reports/item-1/user-a"), marketReport);
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "market_reports/item-1/user-a"), {
        status: "reviewed",
        reviewedAt: 1_700_000_000_100,
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "market_reports/item-1/user-a"), {
        status: "reviewed",
      }),
    );
  });
});
