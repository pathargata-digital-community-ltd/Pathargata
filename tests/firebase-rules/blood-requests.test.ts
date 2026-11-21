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

let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  const claims = uid.startsWith("admin") ? { admin: true } : {};
  return testEnv.authenticatedContext(uid, claims).database();
}

const request = {
  requesterUid: "user-a",
  trackingId: "BLD-20240101-1234",
  bloodGroup: "A+",
  area: "Pathargata",
  units: "1",
  urgency: "critical",
  neededAt: "Today",
  status: "awaiting_donor_response",
  verificationStatus: "approved",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  expiresAt: 1_700_100_000_000,
  updatedBy: "admin-1",
};

const privateRequest = {
  requesterUid: "user-a",
  contact: "01700000000",
  requesterName: "User A",
  patientName: "Patient A",
  hospital: "Pathargata Hospital",
  details: "Urgent need",
  createdAt: 1_700_000_000_000,
};

describe("Realtime Database blood request rules", () => {
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
      await set(ref(database, "blood_requests/request-1"), request);
      await set(ref(database, "blood_request_private/request-1"), privateRequest);
      await set(ref(database, "donors/user-a"), {
        uid: "user-a",
        name: "User A",
        bloodGroup: "A+",
        phone: "01700000000",
        timestamp: 1_700_000_000_000,
      });
      await set(ref(database, "donors_public/user-a"), {
        uid: "user-a",
        name: "User A",
        bloodGroup: "A+",
        union: "কাকচিড়া",
        timestamp: 1_700_000_000_000,
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows sanitized public reads but scopes private patient details to requester/admin", async () => {
    const publicSnapshot = await get(ref(dbFor("user-b"), "blood_requests/request-1"));
    const publicValue = publicSnapshot.val();
    if (publicValue.patientName || publicValue.hospital || publicValue.details || publicValue.contact) throw new Error("Sensitive blood request fields leaked into public projection");
    await assertSucceeds(get(ref(dbFor("user-b"), "blood_requests")));
    await assertSucceeds(get(ref(dbFor("user-a"), "blood_request_private/request-1")));
    await assertFails(get(ref(dbFor("user-b"), "blood_request_private/request-1")));
    await assertSucceeds(get(ref(dbFor("admin-1"), "blood_request_private/request-1")));
  });

  it("rejects sensitive fields in the public blood request projection", async () => {
    await assertFails(set(ref(dbFor("user-b"), "blood_requests/request-sensitive"), {
      ...request,
      requesterUid: "user-b",
      status: "new",
      verificationStatus: "pending",
      updatedBy: "user-b",
      patientName: "Should never be public",
    }));
  });

  it("keeps donor phone records private while exposing only the public donor projection", async () => {
    await assertFails(get(ref(dbFor("user-b"), "donors")));
    await assertFails(get(ref(dbFor("user-b"), "donors/user-a")));
    await assertSucceeds(get(ref(dbFor("user-a"), "donors/user-a")));
    await assertSucceeds(get(ref(dbFor("user-b"), "donors_public")));
    await assertFails(set(ref(dbFor("user-b"), "donors_public/user-a"), {
      uid: "user-a",
      name: "Spoofed",
      bloodGroup: "O-",
      timestamp: 1_700_000_000_001,
    }));
    await assertSucceeds(set(ref(dbFor("user-b"), "donors_public/user-b"), {
      uid: "user-b",
      name: "User B",
      bloodGroup: "B+",
      timestamp: 1_700_000_000_001,
    }));
  });

  it("allows the donor screen's paired private and public registration write", async () => {
    const timestamp = 1_700_000_000_100;
    await assertSucceeds(update(ref(dbFor("user-b")), {
      "donors/user-b": {
        uid: "user-b",
        name: "User B",
        bloodGroup: "B+",
        phone: "01700000000",
        hidePhone: true,
        lastDate: "",
        union: "কাকচিড়া",
        village: "পাথরঘাটা",
        serviceArea: "পাথরঘাটা",
        receiveBloodRequestNotifications: false,
        temporarilyUnavailable: false,
        consentUpdatedAt: timestamp,
        timestamp,
      },
      "donors_public/user-b": {
        uid: "user-b",
        name: "User B",
        bloodGroup: "B+",
        lastDate: "",
        union: "কাকচিড়া",
        village: "পাথরঘাটা",
        serviceArea: "পাথরঘাটা",
        receiveBloodRequestNotifications: false,
        temporarilyUnavailable: false,
        timestamp,
      },
    }));
  });

  it("allows only the requester to create a new pending blood request", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-b"), "blood_requests/request-2"), {
        ...request,
        requesterUid: "user-b",
        status: "new",
        verificationStatus: "pending",
        updatedBy: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "blood_requests/request-3"), request),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "blood_requests/request-4"), {
        ...request,
        requesterUid: "user-b",
        status: "new",
        verificationStatus: "approved",
        updatedBy: "user-b",
      }),
    );
  });

  it("allows the request form to create its public record before the private details", async () => {
    const timestamp = 1_700_000_000_200;
    await assertSucceeds(set(ref(dbFor("user-b"), "blood_requests/request-atomic"), {
        ...request,
        requesterUid: "user-b",
        status: "new",
        verificationStatus: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: timestamp + 24 * 60 * 60 * 1000,
        updatedBy: "user-b",
    }));
    await assertSucceeds(set(ref(dbFor("user-b"), "blood_request_private/request-atomic"), {
        ...privateRequest,
        requesterUid: "user-b",
        contact: "01700000000",
        createdAt: timestamp,
    }));
  });

  it("allows requester completion or cancellation but blocks core-field tampering", async () => {
    await assertSucceeds(
      update(ref(dbFor("user-a"), "blood_requests/request-1"), {
        status: "completed",
        updatedAt: 1_700_000_000_100,
        updatedBy: "user-a",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-a"), "blood_requests/request-1"), {
        bloodGroup: "O-",
        status: "completed",
        updatedBy: "user-a",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-b"), "blood_requests/request-1"), {
        status: "completed",
      }),
    );
    await assertSucceeds(remove(ref(dbFor("user-a"), "blood_requests/request-1")));
  });

  it("allows a non-owner donor response and blocks requester/self or invalid responses", async () => {
    await assertSucceeds(
      update(ref(dbFor("user-b")), {
        "blood_requests/request-1/responses/user-b": {
          response: "can_donate",
          updatedAt: 1_700_000_000_100,
        },
        "blood_requests/request-1/status": "donor_responded",
        "blood_requests/request-1/updatedAt": 1_700_000_000_100,
        "blood_requests/request-1/updatedBy": "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "blood_requests/request-1/responses/user-a"), {
        response: "can_donate",
        updatedAt: 1_700_000_000_200,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "blood_requests/request-1/responses/user-b"), {
        response: "invalid",
        updatedAt: 1_700_000_000_300,
      }),
    );
  });

  it("allows the requester to create and delete only their private contact record", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "blood_requests/request-2"), {
        ...request,
        status: "new",
        verificationStatus: "pending",
        updatedBy: "user-a",
      }),
    );
    await assertSucceeds(
      set(ref(dbFor("user-a"), "blood_request_private/request-2"), {
        ...privateRequest,
        createdAt: 1_700_000_000_500,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "blood_request_private/request-3"), {
        ...privateRequest,
        requesterUid: "user-b",
      }),
    );
    await assertSucceeds(remove(ref(dbFor("user-a"), "blood_request_private/request-1")));
  });

  it("allows admin lifecycle moderation", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "blood_requests/request-1"), {
        status: "arrangements_confirmed",
        updatedAt: 1_700_000_001_000,
        updatedBy: "admin-1",
      }),
    );
  });

  it("allows admins to advance verification and request statuses without changing core request data", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "blood_requests/request-1"), {
        status: "verification_in_progress",
        verificationStatus: "in_progress",
        updatedAt: 1_700_000_002_000,
        updatedBy: "admin-1",
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "blood_requests/request-1"), {
        status: "awaiting_donor_response",
        verificationStatus: "verified",
        updatedAt: 1_700_000_003_000,
        updatedBy: "admin-1",
      }),
    );
    await assertFails(
      update(ref(dbFor("admin-1"), "blood_requests/request-1"), {
        bloodGroup: "O-",
        status: "awaiting_donor_response",
        verificationStatus: "verified",
        updatedAt: 1_700_000_004_000,
        updatedBy: "admin-1",
      }),
    );
  });
});
