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

const application = {
  providerType: "cng",
  providerTypeLabel: "CNG",
  providerName: "আল-আমিন",
  phone: "01700000000",
  whatsapp: "01700000000",
  serviceArea: "পাথরঘাটা সদর",
  vehicleInfo: "সিএনজি অটোরিকশা",
  fare: "আলোচনা সাপেক্ষে",
  details: "সকাল ৮টা থেকে রাত ১০টা পর্যন্ত সেবা",
  uid: "user-a",
  author: "কমিউনিটি সদস্য",
  status: "pending",
  timestamp: 1_700_000_000_000,
};

describe("Realtime Database transport provider application rules", () => {
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
      await set(ref(database, "users/user-b"), { uid: "user-b", status: "user" });
      await set(ref(database, "users/tourist"), { uid: "tourist", status: "tourist" });
      await set(ref(database, "users/admin-1"), { uid: "admin-1", status: "user" });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("accepts only a signed-in, owner-matched pending application with a supported provider type", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "transport_provider_requests/request-1"), application),
    );
    await assertFails(
      set(ref(testEnv.unauthenticatedContext().database(), "transport_provider_requests/anonymous"), application),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "transport_provider_requests/spoofed"), application),
    );
    await assertFails(
      set(ref(dbFor("tourist"), "transport_provider_requests/tourist"), {
        ...application,
        uid: "tourist",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "transport_provider_requests/invalid-type"), {
        ...application,
        providerType: "unsupported_path",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "transport_provider_requests/approved-by-user"), {
        ...application,
        status: "approved",
      }),
    );
  });

  it("keeps applications and contact details private to Admin", async () => {
    await set(ref(dbFor("user-a"), "transport_provider_requests/private"), application);
    await assertFails(
      get(ref(dbFor("user-a"), "transport_provider_requests/private")),
    );
    await assertFails(
      get(ref(dbFor("user-b"), "transport_provider_requests/private")),
    );
    await assertFails(
      get(ref(testEnv.unauthenticatedContext().database(), "transport_provider_requests/private")),
    );
    await assertSucceeds(
      get(ref(dbFor("admin-1"), "transport_provider_requests/private")),
    );
  });

  it("allows one Admin-only atomic approval and directory listing, then blocks a second decision", async () => {
    await set(ref(dbFor("user-a"), "transport_provider_requests/provider-1"), application);
    const approvedAt = 1_700_000_000_100;
    const updates = {
      "transport_provider_requests/provider-1/status": "approved",
      "transport_provider_requests/provider-1/reviewedAt": approvedAt,
      "transport_provider_requests/provider-1/reviewedBy": "admin-1",
      "transport_provider_requests/provider-1/publicRecordId": "provider-1",
      "transport/cng/provider-1": {
        providerName: application.providerName,
        driverName: application.providerName,
        vehicleType: "CNG",
        serviceArea: application.serviceArea,
        vehicleInfo: application.vehicleInfo,
        fare: application.fare,
        details: application.details,
        phone: application.phone,
        whatsapp: application.whatsapp,
        availability: "পরিষেবা পাওয়া যায়",
        verified: true,
        updatedAt: approvedAt,
      },
    };
    await assertSucceeds(update(ref(dbFor("admin-1")), updates));
    await assertSucceeds(get(ref(dbFor("admin-1"), "transport/cng/provider-1")));
    await assertFails(
      update(ref(dbFor("user-a")), {
        "transport/cng/forged": { providerName: "ভুয়া", phone: "01700000000" },
      }),
    );
    await assertFails(
      update(ref(dbFor("admin-1"), "transport_provider_requests/provider-1"), {
        status: "rejected",
      }),
    );
  });
});
