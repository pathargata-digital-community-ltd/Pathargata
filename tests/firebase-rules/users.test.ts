import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, remove, set, update } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const projectId = "pathargata-rules-test";
const rules = fs.readFileSync(
  path.resolve(process.cwd(), "database.rules.json"),
  "utf8",
);
const baseProfile = {
  uid: "user-a",
  name: "User A",
  role: "user",
  status: "user",
  accountAccess: "approved",
  accessReview: "not_required",
  isVerified: false,
};

let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  const claims = uid.startsWith("admin") ? { admin: true } : {};
  return testEnv.authenticatedContext(uid, claims).database();
}

describe("Realtime Database user profile rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      database: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "users/user-a"), baseProfile);
      await set(ref(context.database(), "users/admin"), {
        uid: "admin",
        name: "Admin",
        role: "admin",
        status: "user",
        accountAccess: "approved",
        accessReview: "not_required",
        isVerified: true,
      });
      await set(ref(context.database(), "users/user-b"), {
        uid: "user-b",
        name: "User B",
        role: "user",
        status: "user",
        accountAccess: "approved",
        accessReview: "not_required",
        isVerified: false,
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows an owner to update an ordinary profile field", async () => {
    await assertSucceeds(
      update(ref(dbFor("user-a"), "users/user-a"), {
        name: "Updated User A",
        bio: "A short bio",
      }),
    );
  });

  it("allows an owner to save public profile visibility", async () => {
    await assertSucceeds(
      update(ref(dbFor("user-a"), "users/user-a/settings"), {
        profileVisibility: "everyone",
      }),
    );
  });

  it("denies an owner changing role or admin-owned access fields", async () => {
    await assertFails(
      update(ref(dbFor("user-a"), "users/user-a"), {
        role: "admin",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "users/user-a"), {
        accountAccess: "approved",
        isVerified: true,
      }),
    );
  });

  it("denies another user writing the profile owner does not own", async () => {
    await assertFails(
      update(ref(dbFor("user-b"), "users/user-a"), {
        name: "Tampered",
      }),
    );
  });

  it("denies an owner injecting an unknown top-level profile field", async () => {
    await assertFails(
      update(ref(dbFor("user-a"), "users/user-a"), {
        serverOnlyPrivilege: "admin",
      }),
    );
  });

  it("allows only the documented deactivation and grace-period reactivation transition", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin"), "users/user-a"), {
        status: "deactivated",
        deactivated_at: 1_700_000_000_000,
        deletion_due_at: 4_000_000_000_000,
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("user-a"), "users/user-a"), {
        status: "user",
        deactivated_at: null,
        deletion_due_at: null,
      }),
    );
  });

  it("denies an ordinary user deleting the complete profile subtree", async () => {
    await assertFails(remove(ref(dbFor("user-a"), "users/user-a")));
    await assertSucceeds(get(ref(dbFor("admin"), "users/user-a")));
  });

  it("allows an admin to update an admin-owned field", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin"), "users/user-a"), {
        role: "moderator",
        isVerified: true,
      }),
    );
  });

  it("rejects malformed sensitive fields even for an admin claim", async () => {
    await assertFails(
      update(ref(dbFor("admin"), "users/user-a"), {
        isVerified: "yes",
      }),
    );
    await assertFails(
      update(ref(dbFor("admin"), "users/user-a"), {
        verificationExpiry: "never",
      }),
    );
    await assertFails(
      update(ref(dbFor("admin"), "users/user-a"), {
        uid: "another-user",
      }),
    );
  });

  it("protects points and referral counters and accepts only owned referral events", async () => {
    await assertFails(
      update(ref(dbFor("user-b"), "users/user-a"), {
        total_points: 999999,
        referral_count: 999999,
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("admin"), "users/user-a"), {
        total_points: 10,
        referral_count: 1,
      }),
    );
    await assertSucceeds(
      set(ref(dbFor("user-b"), "referral_events/user-a/user-b"), {
        uid: "user-b",
        timestamp: 1_700_000_000_000,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "referral_events/user-a/user-c"), {
        uid: "user-b",
        timestamp: 1_700_000_000_100,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "referral_events/user-a/user-a"), {
        uid: "user-a",
        timestamp: 1_700_000_000_200,
      }),
    );
    await assertFails(get(ref(dbFor("user-b"), "referral_events")));
  });

  it("only allows a new user profile with the ordinary user role", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-new"), "users/user-new"), {
        uid: "user-new",
        name: "New User",
        role: "user",
        status: "pending_review",
        accountAccess: "locked",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-evil"), "users/user-evil"), {
        uid: "user-evil",
        name: "Evil User",
        role: "admin",
        status: "user",
        accountAccess: "approved",
      }),
    );
  });
});
