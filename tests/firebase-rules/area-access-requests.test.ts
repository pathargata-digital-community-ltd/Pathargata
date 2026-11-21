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

const request = {
  uid: "user-a",
  name: "User A",
  email: "user-a@example.test",
  phone: "01700000000",
  union: "Pathargata",
  village: "Test Village",
  nidUrl: "https://res.cloudinary.com/pathargata/image/upload/v1/nid.jpg",
  reason: "outside_area",
  status: "pending",
  submittedAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const profile = {
  uid: "user-a",
  name: "User A",
  email: "user-a@example.test",
  phone: "01700000000",
  union: "Pathargata",
  village: "Test Village",
  dob: "01/01/2000",
  gender: "",
  role: "user",
  joinDate: "01/01/2025",
  isVerified: false,
  profile_pic: "",
  status: "pending_review",
  accountAccess: "locked",
  accessReview: "pending",
  accessReason: "outside_area",
  registrationLatitude: 22.0,
  registrationLongitude: 90.0,
};

describe("Realtime Database area-access review rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      database: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "users/user-a"), profile);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows the app's atomic NID URL plus request write without changing protected gate fields", async () => {
    await assertSucceeds(
      update(ref(dbFor("user-a")), {
        "users/user-a/nid_url": request.nidUrl,
        "area_access_requests/user-a": request,
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a")), {
        "users/user-a/accountAccess": "approved",
      }),
    );
  });

  it("allows a user to submit their own pending request and limits reads to admins", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "area_access_requests/user-a"), request),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "area_access_requests/user-a"), request),
    );
    await assertFails(
      get(ref(dbFor("user-a"), "area_access_requests/user-a")),
    );
    await assertSucceeds(
      get(ref(dbFor("admin-1"), "area_access_requests")),
    );
  });

  it("rejects untrusted NID hosts and client-side approval attempts", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "area_access_requests/user-a"), {
        ...request,
        nidUrl: "https://example.test/nid.jpg",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "area_access_requests/user-a"), {
        ...request,
        status: "approved",
      }),
    );
  });

  it("allows a user to resubmit a rejected request but not a live pending review", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "area_access_requests/user-a"), {
        ...request,
        status: "rejected",
      });
    });
    await assertSucceeds(
      set(ref(dbFor("user-a"), "area_access_requests/user-a"), {
        ...request,
        updatedAt: 1_700_000_000_100,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "area_access_requests/user-a"), {
        ...request,
        status: "rejected",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "area_access_requests/user-b"), {
        ...request,
        uid: "user-a",
      }),
    );
  });

  it("allows only an admin to approve or reject a submitted request", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "area_access_requests/user-a"), request);
    });
    await assertFails(
      update(ref(dbFor("user-a"), "area_access_requests/user-a"), {
        status: "approved",
        reviewedAt: 1_700_000_000_200,
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "area_access_requests/user-a"), {
        status: "approved",
        reviewedAt: 1_700_000_000_200,
        reviewedBy: "admin-1",
      }),
    );
  });
});
