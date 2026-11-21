import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const projectId = "pathargata-rules-test";
const rules = fs.readFileSync(
  path.resolve(process.cwd(), "database.rules.json"),
  "utf8",
);
const token = {
  token: "ExponentPushToken[test-token]",
  platform: "android",
  updatedAt: 1_700_000_000_000,
};

let testEnv: RulesTestEnvironment;

function dbFor(uid?: string) {
  const context = uid
    ? testEnv.authenticatedContext(uid)
    : testEnv.unauthenticatedContext();
  return context.database();
}

describe("Realtime Database push token rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      database: {
        rules,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows an authenticated user to create and read their own token", async () => {
    const ownToken = ref(
      dbFor("user-a"),
      "pushTokens/user-a/token-key",
    );

    await assertSucceeds(set(ownToken, token));
    const snapshot = await assertSucceeds(get(ownToken));
    expect(snapshot.val()).toEqual(token);
  });

  it("denies an authenticated user access to another user's token", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "pushTokens/user-a/token-key"), token),
    );

    await assertFails(
      get(ref(dbFor("user-b"), "pushTokens/user-a/token-key")),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "pushTokens/user-a/token-key"), token),
    );
  });

  it("denies unauthenticated token reads and writes", async () => {
    const tokenRef = ref(dbFor(), "pushTokens/user-a/token-key");

    await assertFails(get(tokenRef));
    await assertFails(set(tokenRef, token));
  });

  it("rejects token records without the required registration fields", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "pushTokens/user-a/token-key"), {
        token: token.token,
      }),
    );
  });
});
