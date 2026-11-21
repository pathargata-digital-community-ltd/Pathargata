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

const report = {
  reason: "Spam post",
  timestamp: 1_700_000_000_000,
  reporterName: "User A",
};

describe("Realtime Database post report rules", () => {
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
        text: "A post",
      });
      await set(ref(database, "reports/post-1/user-a"), report);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows admin reads and denies regular user reads", async () => {
    await assertSucceeds(get(ref(dbFor("admin-1"), "reports")));
    await assertFails(get(ref(dbFor("user-a"), "reports")));
  });

  it("allows one report per authenticated user for an existing post", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-b"), "reports/post-1/user-b"), {
        reason: "Harassment",
        timestamp: 1_700_000_000_100,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "reports/post-1/user-a"), report),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "reports/missing-post/user-a"), report),
    );
  });

  it("denies reporter UID spoofing and invalid report payloads", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "reports/post-1/user-b"), report),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "reports/post-1/user-a"), {
        reason: "",
        timestamp: 1_700_000_000_100,
      }),
    );
  });

  it("allows admin moderation updates", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "reports/post-1/user-a"), {
        moderationStatus: "reviewed",
        reviewedAt: 1_700_000_000_200,
      }),
    );
  });
});
