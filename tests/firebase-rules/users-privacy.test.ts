import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const projectId = "pathargata-rules-test";
const rules = fs.readFileSync(
  path.resolve(process.cwd(), "database.rules.json"),
  "utf8",
);

let testEnv: RulesTestEnvironment;

function dbFor(uid: string, claims: Record<string, unknown> = {}) {
  return testEnv.authenticatedContext(uid, claims).database();
}

describe("Realtime Database private users rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      database: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "users/user-a"), {
        uid: "user-a",
        name: "User A",
        email: "private@example.com",
        friends: { "user-b": true },
        settings: { messagePrivacy: "friends" },
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows self reads but blocks another user's private profile", async () => {
    await assertSucceeds(get(ref(dbFor("user-a"), "users/user-a")));
    await assertFails(get(ref(dbFor("user-b"), "users/user-a")));
    await assertFails(get(ref(dbFor("user-b"), "users")));
    await assertFails(get(ref(testEnv.unauthenticatedContext().database(), "users/user-a")));
  });

  it("keeps only the deliberate public friendship and messaging policy reads available", async () => {
    const db = dbFor("user-b");
    await assertSucceeds(get(ref(db, "users/user-a/friends")));
    await assertSucceeds(get(ref(db, "users/user-a/friends/user-b")));
    await assertSucceeds(get(ref(db, "users/user-a/settings/messagePrivacy")));
    await assertFails(get(ref(db, "users/user-a/settings/email")));
  });
});
