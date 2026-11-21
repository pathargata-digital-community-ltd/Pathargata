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

const alert = {
  uid: "user-a",
  type: "medical",
  severity: "high",
  title: "Urgent help needed",
  desc: "Please send medical assistance",
  location: "Pathargata",
  status: "reported",
  verificationStatus: "unverified",
  timestamp: 1_700_000_000_000,
};
const privateAlert = {
  requesterUid: "user-a",
  contact: "01700000000",
  authorName: "Reporter A",
  affectedCount: "2",
  latitude: 22.04,
  longitude: 89.97,
  createdAt: 1_700_000_000_000,
};

describe("Realtime Database emergency alert rules", () => {
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
      await set(ref(database, "users/admin-1"), {
        uid: "admin-1",
        role: "admin",
        status: "user",
      });
      await set(ref(database, "emergency_alerts/alert-1"), alert);
      await set(ref(database, "emergency_alert_private/alert-1"), privateAlert);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows sanitized community reads and scopes private reporter data", async () => {
    const publicSnapshot = await get(ref(dbFor("user-b"), "emergency_alerts/alert-1"));
    const publicValue = publicSnapshot.val();
    if (publicValue.contact || publicValue.authorName || publicValue.affectedCount || publicValue.latitude || publicValue.longitude) throw new Error("Private emergency fields leaked into public alert");
    await assertSucceeds(get(ref(dbFor("user-b"), "emergency_alerts")));
    await assertSucceeds(get(ref(dbFor("user-a"), "emergency_alert_private/alert-1")));
    await assertFails(get(ref(dbFor("user-b"), "emergency_alert_private/alert-1")));
    await assertSucceeds(get(ref(dbFor("admin-1"), "emergency_alert_private/alert-1")));
    await assertFails(
      get(ref(testEnv.unauthenticatedContext().database(), "emergency_alerts")),
    );
  });

  it("rejects private fields in the public emergency projection", async () => {
    await assertFails(set(ref(dbFor("user-b"), "emergency_alerts/alert-private"), { ...alert, uid: "user-b", contact: "01700000000" }));
    for (const field of ["phone", "phoneNumber", "requesterName", "email", "gps", "coordinates"]) {
      await assertFails(set(ref(dbFor("user-b"), `emergency_alerts/alias-${field}`), { ...alert, uid: "user-b", [field]: "private-value" }));
    }
  });

  it("allows a non-tourist user to create only their own reported unverified alert", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-b"), "emergency_alerts/alert-2"), {
        ...alert,
        uid: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "emergency_alerts/alert-3"), alert),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "emergency_alerts/alert-4"), {
        ...alert,
        uid: "user-b",
        verificationStatus: "verified",
      }),
    );
  });

  it("denies regular users changing an existing alert or moderation fields", async () => {
    await assertFails(
      update(ref(dbFor("user-a"), "emergency_alerts/alert-1"), {
        status: "resolved",
      }),
    );
    await assertFails(
      update(ref(dbFor("user-b"), "emergency_alerts/alert-1"), {
        verificationStatus: "verified",
      }),
    );
  });

  it("allows sequential public and private SOS writes used by the app", async () => {
    const database = dbFor("user-b");
    await assertSucceeds(set(ref(database, "emergency_alerts/alert-sequential"), { ...alert, uid: "user-b" }));
    await assertSucceeds(set(ref(database, "emergency_alert_private/alert-sequential"), { ...privateAlert, requesterUid: "user-b" }));
  });

  it("allows the owner to create and delete only their private emergency record", async () => {
    await assertSucceeds(set(ref(dbFor("user-b"), "emergency_alerts/alert-2"), { ...alert, uid: "user-b" }));
    await assertSucceeds(set(ref(dbFor("user-b"), "emergency_alert_private/alert-2"), { ...privateAlert, requesterUid: "user-b" }));
    await assertFails(set(ref(dbFor("user-b"), "emergency_alert_private/alert-3"), { ...privateAlert, requesterUid: "user-a" }));
    await assertSucceeds(set(ref(dbFor("user-b"), "emergency_alert_private/alert-2"), null));
  });

  it("allows only admin moderation updates", async () => {
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "emergency_alerts/alert-1"), {
        status: "responding",
        verificationStatus: "verified",
        updatedAt: Date.now(),
        updatedBy: "admin-1",
      }),
    );
  });

  it("allows an atomic Admin triage update with its immutable audit event", async () => {
    const timestamp = Date.now();
    const audit = {
      actorUid: "admin-1",
      action: "emergency_alert_responding",
      target: "emergency_alerts/alert-1",
      before: JSON.stringify({ status: "reported", verificationStatus: "unverified" }),
      after: JSON.stringify({ status: "responding", verificationStatus: "verified" }),
      reason: "Coordinator started response",
      requestId: "emergency-ui-test-1",
      timestamp,
      result: "success",
    };
    await assertSucceeds(update(ref(dbFor("admin-1")), {
      "emergency_alerts/alert-1/status": "responding",
      "emergency_alerts/alert-1/verificationStatus": "verified",
      "emergency_alerts/alert-1/updatedAt": timestamp,
      "emergency_alerts/alert-1/updatedBy": "admin-1",
      "super_admin_audit/emergency-audit-1": audit,
    }));
    const savedAlert = (await get(ref(dbFor("admin-1"), "emergency_alerts/alert-1"))).val();
    const savedAudit = (await get(ref(dbFor("admin-1"), "super_admin_audit/emergency-audit-1"))).val();
    if (savedAlert.status !== "responding" || savedAlert.verificationStatus !== "verified" || savedAlert.updatedBy !== "admin-1" || savedAudit.actorUid !== "admin-1") {
      throw new Error("The emergency action and audit event did not persist together");
    }
  });

  it("rejects invalid incident states and Admin metadata attributed to another user", async () => {
    const adminDb = dbFor("admin-1");
    await assertFails(update(ref(adminDb, "emergency_alerts/alert-1"), { status: "closed" }));
    await assertFails(update(ref(adminDb, "emergency_alerts/alert-1"), { status: "responding" }));
    await assertFails(set(ref(adminDb, "emergency_alerts/alert-1"), null));
    await assertFails(update(ref(adminDb, "emergency_alerts/alert-1"), {
      status: "responding",
      updatedAt: Date.now(),
      updatedBy: "admin-2",
    }));
    await assertSucceeds(update(ref(adminDb, "emergency_alerts/alert-1"), { status: "resolved", updatedAt: Date.now(), updatedBy: "admin-1" }));
    await assertFails(update(ref(adminDb, "emergency_alerts/alert-1"), { status: "reported", updatedAt: Date.now(), updatedBy: "admin-1" }));
    await assertSucceeds(update(ref(adminDb, "emergency_alerts/alert-1"), { status: "cancelled", updatedAt: Date.now(), updatedBy: "admin-1" }));
    await assertSucceeds(update(ref(adminDb, "emergency_alerts/alert-1"), { status: "reported", verificationStatus: "unverified", updatedAt: Date.now(), updatedBy: "admin-1" }));
    await assertFails(get(ref(dbFor("user-a"), "super_admin_audit/emergency-audit-1")));
  });
});
