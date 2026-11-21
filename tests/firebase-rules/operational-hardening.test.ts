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

function superAdminDb(uid = "superadmin-1") {
  return testEnv.authenticatedContext(uid, { email: "admin@gmail.com", admin: true, superAdmin: true }).database();
}

const deletionRequest = {
  uid: "user-a",
  name: "User A",
  email: "user-a@example.test",
  phone: "01700000000",
  profile_pic: "",
  timestamp: 1_700_000_000_000,
};

describe("Realtime Database operational hardening", () => {
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
      await set(ref(database, "account_deletion_requests/user-a"), deletionRequest);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("keeps monetization and withdrawal queues admin-write-only", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "monetization_requests/request-1"), {
        uid: "user-a",
        amount: 100,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "withdraw_requests/request-1"), {
        uid: "user-a",
        amount: 100,
      }),
    );
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "monetization_requests/request-1"), {
        uid: "user-a",
        amount: 100,
      }),
    );
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "withdraw_requests/request-1"), {
        uid: "user-a",
        amount: 100,
      }),
    );
  });

  it("allows a Super Admin to create an audit event but never edit or delete it", async () => {
    const event = {
      actorUid: "superadmin-1",
      action: "test.action",
      target: "test/path",
      before: "{}",
      after: "{\"ok\":true}",
      reason: "Rules regression test",
      requestId: "request-audit-1",
      timestamp: 1_700_000_000_000,
      result: "success",
    };
    await assertSucceeds(set(ref(superAdminDb(), "super_admin_audit/event-1"), event));
    await assertFails(update(ref(superAdminDb(), "super_admin_audit/event-1"), { result: "rejected" }));
    await assertFails(set(ref(superAdminDb(), "super_admin_audit/event-1"), { ...event, result: "rejected" }));
    await assertFails(set(ref(superAdminDb(), "super_admin_audit/event-1"), null));
    await assertFails(get(ref(dbFor("user-a"), "super_admin_audit/event-1")));
  });

  it("allows a user to create only their own deletion request", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-b"), "account_deletion_requests/user-b"), {
        ...deletionRequest,
        uid: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "account_deletion_requests/user-a"), {
        ...deletionRequest,
        uid: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "account_deletion_requests/user-a"), {
        ...deletionRequest,
        email: 123,
      }),
    );
  });

  it("prevents an owner from overwriting an existing deletion request", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "account_deletion_requests/user-a"), {
        ...deletionRequest,
        timestamp: deletionRequest.timestamp + 1,
      }),
    );
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "account_deletion_requests/user-a"), {
        ...deletionRequest,
        timestamp: deletionRequest.timestamp + 1,
      }),
    );
  });

  it("allows an owner to submit one valid lifecycle request and rejects spoofed actions", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-b"), "account_lifecycle_requests/user-b"), {
        uid: "user-b",
        action: "deactivate",
        requestedAt: 1_700_000_000_000,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "account_lifecycle_requests/user-a"), {
        uid: "user-b",
        action: "delete",
        requestedAt: 1_700_000_000_000,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "account_lifecycle_requests/user-b"), {
        uid: "user-b",
        action: "purge_now",
        requestedAt: 1_700_000_000_000,
      }),
    );
  });

  it("allows a user to enter a future-dated deactivation grace period", async () => {
    const now = Date.now();
    await assertSucceeds(
      update(ref(dbFor("user-b"), "users/user-b"), {
        status: "deactivated",
        deactivated_at: now,
        deletion_due_at: now + 30 * 24 * 60 * 60 * 1000,
      }),
    );
  });

  it("allows reactivation before the deadline but rejects it after the deadline", async () => {
    const futureDueAt = Date.now() + 24 * 60 * 60 * 1000;
    await assertSucceeds(
      update(ref(dbFor("user-b"), "users/user-b"), {
        status: "deactivated",
        deactivated_at: Date.now(),
        deletion_due_at: futureDueAt,
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("user-b"), "users/user-b"), {
        status: "user",
        deactivated_at: null,
        deletion_due_at: null,
      }),
    );
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database(), "users/user-b"), {
        status: "deactivated",
        deactivated_at: 1_600_000_000_000,
        deletion_due_at: 1_600_000_100_000,
      });
    });
    await assertFails(
      update(ref(dbFor("user-b"), "users/user-b"), {
        status: "user",
        deactivated_at: null,
        deletion_due_at: null,
      }),
    );
  });

  it("scopes user post index writes and reads to the post owner", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "posts/post-index-1"), { uid: "user-b", timestamp: 1_700_000_000_000 });
    });
    await assertSucceeds(
      set(ref(dbFor("user-b"), "user_post_index/user-b/post-index-1"), { timestamp: 1_700_000_000_000 }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "user_post_index/user-b/post-index-1"), { timestamp: 1_700_000_000_000 }),
    );
    await assertSucceeds(get(ref(dbFor("user-b"), "user_post_index/user-b")));
    await assertFails(get(ref(dbFor("user-a"), "user_post_index/user-b")));
  });

  it("allows only the public post owner to create a public projection", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "posts/public-projection-1"), { uid: "user-b", privacy: "public", timestamp: 1_700_000_000_000 });
      await set(ref(context.database(), "posts/private-projection-1"), { uid: "user-b", privacy: "only_me", timestamp: 1_700_000_000_001 });
    });
    await assertSucceeds(
      set(ref(dbFor("user-b"), "public_posts/public-projection-1"), { uid: "user-b", privacy: "public", timestamp: 1_700_000_000_000 }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "public_posts/public-projection-1"), { uid: "user-b", privacy: "public", timestamp: 1_700_000_000_000 }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "public_posts/private-projection-1"), { uid: "user-b", privacy: "only_me", timestamp: 1_700_000_000_001 }),
    );
  });
});
