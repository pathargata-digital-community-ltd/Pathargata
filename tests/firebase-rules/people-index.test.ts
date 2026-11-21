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

describe("Realtime Database public people index rules", () => {
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
        nickname: "A",
        profile_pic: "https://example.com/a.png",
        union: "Union",
        village: "Village",
        profession: "Teacher",
        isVerified: false,
        status: "user",
        settings: { profileVisibility: "everyone", tagPermission: "everyone" },
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows authenticated reads but denies unauthenticated reads", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "people_index/user-a"), {
        uid: "user-a",
        name: "User A",
        sortName: "user a",
        searchName: "user a union village",
      });
    });
    await assertSucceeds(get(ref(dbFor("user-b"), "people_index/user-a")));
    await assertFails(get(ref(testEnv.unauthenticatedContext().database(), "people_index/user-a")));
  });

  it("allows the opted-in owner or a configured email admin to write a valid projection", async () => {
    const projection = {
      uid: "user-a",
      name: "User A",
      sortName: "user a",
      searchName: "user a union village",
      union: "Union",
      village: "Village",
      profession: "Teacher",
      profile_pic: "https://example.com/a.png",
      isVerified: false,
      status: "user",
      profileVisibility: "everyone",
    };
    await assertSucceeds(set(ref(dbFor("user-a"), "people_index/user-a"), projection));
    await assertFails(set(ref(dbFor("role-only-admin"), "people_index/user-a"), projection));
    await assertSucceeds(set(ref(dbFor("admin-1", { admin: true }), "people_index/user-a"), projection));
    await assertFails(set(ref(dbFor("admin-1", { admin: true }), "people_index/user-b"), {
      ...projection,
      uid: "user-a",
    }));
  });

  it("allows a verified category badge only when it matches the admin-approved user field", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "users/user-a/isVerified"), true);
      await set(ref(context.database(), "users/user-a/verificationCategory"), "professional");
    });
    const verifiedProjection = {
      uid: "user-a",
      name: "User A",
      sortName: "user a",
      searchName: "user a union village teacher",
      union: "Union",
      village: "Village",
      profession: "Teacher",
      isVerified: true,
      verificationCategory: "professional",
      profileVisibility: "everyone",
    };
    await assertSucceeds(set(ref(dbFor("user-a"), "people_index/user-a"), verifiedProjection));
    await assertFails(set(ref(dbFor("user-a"), "people_index/user-a"), {
      ...verifiedProjection,
      verificationCategory: "journalist",
    }));
  });
});
