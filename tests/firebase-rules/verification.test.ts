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
  planId: "verified-30",
  paymentMethod: "bKash",
  paymentNumber: "01700000000",
  receiverNumber: "01700000001",
  trxId: "TXN-123",
  category: "professional",
  nid: "1234567890",
  docImage: "https://res.cloudinary.com/pathargata/image/upload/v1/doc.jpg",
  userImage: "https://res.cloudinary.com/pathargata/image/upload/v1/user.jpg",
  timestamp: 1_700_000_000_000,
  status: "pending",
};

describe("Realtime Database verification rules", () => {
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
        name: "User A",
        role: "user",
        status: "user",
        accountAccess: "approved",
        accessReview: "not_required",
        isVerified: false,
      });
      await set(ref(database, "users/user-b"), {
        uid: "user-b",
        name: "User B",
        role: "user",
        status: "user",
        accountAccess: "approved",
        accessReview: "not_required",
        isVerified: false,
      });
      await set(ref(database, "users/admin-1"), {
        uid: "admin-1",
        name: "Admin",
        role: "admin",
        status: "user",
        accountAccess: "approved",
        accessReview: "not_required",
        isVerified: true,
      });
      await set(ref(database, "verification_requests/user-a"), request);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("scopes verification request reads to the owner and admins", async () => {
    await assertSucceeds(get(ref(dbFor("user-a"), "verification_requests/user-a")));
    await assertFails(get(ref(dbFor("user-b"), "verification_requests/user-a")));
    await assertSucceeds(get(ref(dbFor("admin-1"), "verification_requests")));
  });

  it("allows an owner to submit a pending request but denies spoofed or approved client requests", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-b"), "verification_requests/user-b"), {
        ...request,
        uid: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "verification_requests/user-c"), {
        ...request,
        uid: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "verification_requests/user-b-approved"), {
        ...request,
        uid: "user-b",
        status: "approved",
      }),
    );
  });

  it("rejects unsupported payment methods, invalid NID values, and untrusted image hosts", async () => {
    await assertFails(
      set(ref(dbFor("user-b"), "verification_requests/user-b-invalid"), {
        ...request,
        uid: "user-b",
        paymentMethod: "Bitcoin",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "verification_requests/user-b-invalid-nid"), {
        ...request,
        uid: "user-b",
        nid: "not-a-nid",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "verification_requests/user-b-invalid-image"), {
        ...request,
        uid: "user-b",
        docImage: "https://example.test/document.jpg",
      }),
    );
  });

  it("prevents an owner from changing review fields or approving their request", async () => {
    await assertFails(
      update(ref(dbFor("user-a"), "verification_requests/user-a"), {
        status: "approved",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "verification_requests/user-a"), {
        reviewNote: "self-approved",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "verification_requests/user-a"), {
        paymentNumber: "01800000000",
        timestamp: 1_700_000_000_100,
      }),
    );
  });

  it("allows only admin review updates and controlled user pending transition", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "verification_requests/user-a"), {
        status: "approved",
        reviewedBy: "admin-1",
        reviewedAt: 1_700_000_000_200,
        reviewNote: "Documents verified",
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("user-a"), "users/user-a"), {
        verificationStatus: "pending",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "users/user-a"), {
        verificationStatus: "approved",
        isVerified: true,
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "users/user-a"), {
        verificationStatus: "approved",
        verificationCategory: "professional",
        verificationExpiry: 1_800_000_000_000,
        isVerified: true,
      }),
    );
  });

  it("allows signed-in app users to read verification wallet numbers but only admins to change them", async () => {
    const receiverNumbers = { bKash: "01700000001", Nagad: "01800000002", Rocket: "01600000003" };
    await assertSucceeds(set(ref(dbFor("admin-1"), "admin_settings/verification_payment_numbers"), receiverNumbers));
    await assertSucceeds(get(ref(dbFor("user-a"), "admin_settings/verification_payment_numbers")));
    await assertFails(set(ref(dbFor("user-a"), "admin_settings/verification_payment_numbers"), receiverNumbers));
  });
});
