import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { equalTo, get, orderByChild, query, ref, set, update } from "firebase/database";
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

const complaint = {
  uid: "user-a",
  timestamp: 1_700_000_000_000,
  status: "Submitted",
  type: "road",
  submitTo: "Municipality",
  text: "Road repair needed",
  location: "Pathargata",
};

describe("Realtime Database complaint rules", () => {
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
      await set(ref(database, "complaints/complaint-1"), complaint);
      await set(ref(database, "complaints/complaint-resolved"), {
        ...complaint,
        status: "Resolved",
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows an owner query and denies another user's complaint query/read", async () => {
    await assertSucceeds(
      get(
        query(
          ref(dbFor("user-a"), "complaints"),
          orderByChild("uid"),
          equalTo("user-a"),
        ),
      ),
    );
    await assertFails(
      get(
        query(
          ref(dbFor("user-b"), "complaints"),
          orderByChild("uid"),
          equalTo("user-a"),
        ),
      ),
    );
    await assertFails(get(ref(dbFor("user-b"), "complaints/complaint-1")));
    await assertSucceeds(get(ref(dbFor("user-a"), "complaints/complaint-1")));
    await assertSucceeds(get(ref(dbFor("admin-1"), "complaints")));
  });

  it("allows only an authenticated owner to create a submitted complaint", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "complaints/complaint-new"), complaint),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "complaints/complaint-spoof"), complaint),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "complaints/complaint-invalid"), {
        ...complaint,
        status: "Resolved",
      }),
    );
  });

  it("rejects unsupported categories, oversized text, and untrusted evidence URLs", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "complaints/complaint-bad-category"), {
        ...complaint,
        type: "admin_override",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "complaints/complaint-long-text"), {
        ...complaint,
        text: "x".repeat(2_001),
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "complaints/complaint-bad-image"), {
        ...complaint,
        image: "https://example.test/evidence.jpg",
      }),
    );
  });

  it("allows an owner to reopen only their resolved complaint without changing core fields", async () => {
    await assertSucceeds(
      update(ref(dbFor("user-a"), "complaints/complaint-resolved"), {
        status: "Reopened",
        updatedAt: 1_700_000_000_100,
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "complaints/complaint-1"), {
        status: "Resolved",
        text: "Tampered",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-b"), "complaints/complaint-resolved"), {
        status: "Reopened",
      }),
    );
  });

  it("allows an admin to update moderation fields", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "complaints/complaint-1"), {
        status: "In Progress",
        adminReply: "We are reviewing this complaint.",
        updatedAt: 1_700_000_000_200,
      }),
    );
  });
});
