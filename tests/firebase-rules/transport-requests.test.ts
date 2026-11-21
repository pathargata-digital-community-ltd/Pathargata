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

const transportRequest = {
  title: "কাকচিড়া থেকে সদর CNG",
  phone: "01700000000",
  details: "সকাল ৯টা থেকে গাড়ি পাওয়া যাবে",
  uid: "user-a",
  author: "কমিউনিটি সদস্য",
  timestamp: 1_700_000_000_000,
  status: "open",
};

describe("Realtime Database Transport information rules", () => {
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
      await set(ref(database, "users/user-a"), { uid: "user-a", status: "user" });
      await set(ref(database, "users/user-b"), { uid: "user-b", status: "tourist" });
      await set(ref(database, "users/admin-1"), { uid: "admin-1", status: "user" });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows a signed-in community member to publish valid Transport information", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "service_requests/transport/request-1"), transportRequest),
    );
  });

  it("keeps transport requests private to Admin instead of exposing submitter phone numbers", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(
        ref(context.database(), "service_requests/transport/request-public"),
        transportRequest,
      );
    });
    await assertFails(
      get(ref(dbFor("user-a"), "service_requests/transport/request-public")),
    );
    await assertFails(
      get(ref(dbFor("user-b"), "service_requests/transport/request-public")),
    );
    await assertSucceeds(
      get(ref(dbFor("admin-1"), "service_requests/transport/request-public")),
    );
    await assertFails(
      get(ref(testEnv.unauthenticatedContext().database(), "service_requests/transport/request-public")),
    );
  });

  it("denies anonymous, tourist, spoofed-owner and non-admin update attempts", async () => {
    await assertFails(
      set(ref(testEnv.unauthenticatedContext().database(), "service_requests/transport/request-anon"), transportRequest),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "service_requests/transport/request-tourist"), {
        ...transportRequest,
        uid: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "service_requests/transport/request-spoofed"), transportRequest),
    );
    await assertSucceeds(
      set(ref(dbFor("user-a"), "service_requests/transport/request-owned"), transportRequest),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "service_requests/transport/request-owned"), {
        status: "resolved",
      }),
    );
  });

  it("allows admin moderation and rejects malformed submissions", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "service_requests/transport/request-review"), transportRequest),
    );
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "service_requests/transport/request-review"), {
        status: "approved",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "service_requests/transport/request-empty"), {
        ...transportRequest,
        details: "",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "service_requests/transport/request-invalid-status"), {
        ...transportRequest,
        status: "approved",
      }),
    );
  });
});
