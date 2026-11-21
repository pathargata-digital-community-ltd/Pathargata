import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { equalTo, get, orderByChild, query, ref, remove, runTransaction, set, update } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const projectId = "pathargata-rules-test";
const rules = fs.readFileSync(path.resolve(process.cwd(), "database.rules.json"), "utf8");
let testEnv: RulesTestEnvironment;

function dbFor(uid: string, claims: Record<string, unknown> = {}) {
  return testEnv.authenticatedContext(uid, claims).database();
}

const now = Date.now();

function request(status: string, responses?: Record<string, { response: string; updatedAt: number }>) {
  return {
    requesterUid: "requester-1",
    trackingId: "BLD-20261115-1234",
    bloodGroup: "A+",
    area: "কাকচিড়া",
    units: "1",
    urgency: "critical",
    neededAt: "আজ",
    status,
    verificationStatus: status === "new" ? "pending" : "verified",
    nextAction: "সমন্বয়কারী যাচাই করবেন",
    createdAt: now - 10_000,
    updatedAt: now - 5_000,
    expiresAt: now + 86_400_000,
    updatedBy: "requester-1",
    ...(responses ? { responses } : {}),
  };
}

const privateRequest = {
  requesterUid: "requester-1",
  contact: "01700000000",
  requesterName: "Requester One",
  patientName: "Patient One",
  hospital: "Pathargata Hospital",
  details: "প্রয়োজনীয় private তথ্য",
  createdAt: now - 10_000,
};

const activeMembership = {
  uid: "operator-1",
  email: "operator@example.test",
  displayName: "Operator One",
  organizationName: "রক্তসেবা সংস্থা",
  role: "blood_operator",
  scope: "pathargata_all",
  active: true,
  createdAt: now - 100_000,
  createdBy: "owner-1",
  updatedAt: now - 100_000,
  updatedBy: "owner-1",
};

const donorPrivate = {
  uid: "donor-1",
  name: "Donor One",
  bloodGroup: "A+",
  phone: "01700000000",
  lastDate: "",
  serviceArea: "কাকচিড়া",
  receiveBloodRequestNotifications: true,
  temporarilyUnavailable: false,
  consentUpdatedAt: now - 100_000,
  timestamp: now - 100_000,
};

const contactShare = {
  requestId: "request-live",
  donorUid: "donor-1",
  donorName: "Donor One",
  phone: "01700000000",
  consentAt: now,
  consentStatus: "active",
  consentTextVersion: "blood-contact-share-v1",
};

describe("Realtime Database blood partner operations rules", () => {
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
      await set(ref(database, "blood_requests/request-active"), request("new"));
      await set(ref(database, "blood_requests/request-skip"), request("new"));
      await set(ref(database, "blood_requests/request-live"), request("donor_responded", {
        "donor-1": { response: "can_donate", updatedAt: now - 1_000 },
      }));
      await set(ref(database, "blood_requests/request-closed"), request("completed", {
        "donor-1": { response: "can_donate", updatedAt: now - 1_000 },
      }));
      await set(ref(database, "blood_request_private/request-active"), privateRequest);
      await set(ref(database, "blood_request_private/request-live"), privateRequest);
      await set(ref(database, "blood_request_private/request-closed"), privateRequest);
      await set(ref(database, "blood_partner_access/operator-1"), activeMembership);
      await set(ref(database, "blood_partner_access/operator-disabled"), {
        ...activeMembership,
        uid: "operator-disabled",
        active: false,
      });
      await set(ref(database, "blood_partner_access_requests/applicant-1"), {
        uid: "applicant-1",
        email: "applicant@example.test",
        displayName: "Applicant One",
        organizationName: "নতুন রক্তসেবা সংস্থা",
        phone: "01700000001",
        status: "pending",
        requestedAt: now - 5_000,
      });
      await set(ref(database, "donors/donor-1"), donorPrivate);
      await set(ref(database, "donors_public/donor-1"), {
        uid: "donor-1",
        name: "Donor One",
        bloodGroup: "A+",
        union: "কাকচিড়া",
        serviceArea: "কাকচিড়া",
        receiveBloodRequestNotifications: true,
        temporarilyUnavailable: false,
        timestamp: now - 100_000,
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows project admins to read the owner lists while denying root-list reads to operators", async () => {
    const owner = dbFor("owner-1", { admin: true, email: "admin@example.test" });
    const operator = dbFor("operator-1");

    const memberships = await assertSucceeds(get(ref(owner, "blood_partner_access")));
    if (!memberships.hasChild("operator-1")) throw new Error("Owner could not read the seeded membership list");

    const pendingRequests = await assertSucceeds(get(query(
      ref(owner, "blood_partner_access_requests"),
      orderByChild("status"),
      equalTo("pending"),
    )));
    if (!pendingRequests.hasChild("applicant-1")) throw new Error("Owner could not read the pending application list");

    await assertFails(get(ref(operator, "blood_partner_access")));
    await assertFails(get(query(
      ref(operator, "blood_partner_access_requests"),
      orderByChild("status"),
      equalTo("pending"),
    )));
  });

  it("limits operators to their own membership and blood-service data, never donor-private profiles", async () => {
    const operator = dbFor("operator-1");
    await assertSucceeds(get(ref(operator, "blood_partner_access/operator-1")));
    await assertFails(get(ref(operator, "blood_partner_access")));
    await assertSucceeds(get(ref(operator, "blood_requests")));
    await assertSucceeds(get(ref(operator, "blood_request_private/request-active")));
    await assertFails(get(ref(operator, "blood_request_private/request-closed")));
    await assertFails(get(ref(operator, "donors")));
    await assertFails(get(ref(operator, "donors/donor-1")));
    await assertFails(get(ref(dbFor("operator-disabled"), "blood_request_private/request-active")));
  });

  it("permits only the approved request lifecycle fields and valid operator transitions", async () => {
    const operator = dbFor("operator-1");
    await assertSucceeds(update(ref(operator), {
      "blood_requests/request-active/status": "verification_in_progress",
      "blood_requests/request-active/updatedAt": now,
      "blood_requests/request-active/updatedBy": "operator-1",
      "blood_requests/request-active/nextAction": "যাচাই চলছে",
    }));
    await assertSucceeds(update(ref(operator), {
      "blood_requests/request-active/status": "awaiting_donor_response",
      "blood_requests/request-active/verificationStatus": "verified",
      "blood_requests/request-active/updatedAt": now + 1,
      "blood_requests/request-active/updatedBy": "operator-1",
      "blood_requests/request-active/nextAction": "ডোনারের সাড়া অপেক্ষা",
    }));
    await assertFails(update(ref(operator), {
      "blood_requests/request-skip/status": "awaiting_donor_response",
      "blood_requests/request-skip/verificationStatus": "verified",
      "blood_requests/request-skip/updatedAt": now + 2,
      "blood_requests/request-skip/updatedBy": "operator-1",
      "blood_requests/request-skip/nextAction": "skip verification",
    }));
    await assertFails(update(ref(operator), {
      "blood_requests/request-live/bloodGroup": "O-",
      "blood_requests/request-live/status": "arrangements_confirmed",
      "blood_requests/request-live/updatedAt": now + 3,
      "blood_requests/request-live/updatedBy": "operator-1",
      "blood_requests/request-live/nextAction": "changed core data",
    }));
    await assertFails(set(ref(operator, "blood_requests/request-active"), request("completed")));
    await assertFails(update(ref(dbFor("operator-disabled")), {
      "blood_requests/request-active/status": "verification_in_progress",
      "blood_requests/request-active/updatedAt": now + 4,
      "blood_requests/request-active/updatedBy": "operator-disabled",
      "blood_requests/request-active/nextAction": "inactive operator",
    }));
  });

  it("lets a donor share a phone only for their own eligible request and lets that request's operator read it", async () => {
    const donor = dbFor("donor-1");
    const operator = dbFor("operator-1");
    await assertSucceeds(set(ref(donor, "blood_contact_shares/request-live/donor-1"), contactShare));
    await assertSucceeds(get(ref(donor, "blood_contact_shares/request-live/donor-1")));
    await assertSucceeds(get(ref(operator, "blood_contact_shares/request-live/donor-1")));
    await assertFails(get(ref(operator, "blood_contact_shares/request-live")));
    await assertFails(get(ref(dbFor("requester-1"), "blood_contact_shares/request-live/donor-1")));
    await assertFails(get(ref(operator, "donors/donor-1")));
    await assertFails(set(ref(donor, "blood_contact_shares/request-closed/donor-1"), {
      ...contactShare,
      requestId: "request-closed",
    }));
    await assertFails(set(ref(donor, "blood_contact_shares/request-live/donor-1"), {
      ...contactShare,
      phone: "01800000000",
    }));
  });

  it("hides a donor's shared number from operators after the request closes, while preserving donor revocation", async () => {
    const donor = dbFor("donor-1");
    const operator = dbFor("operator-1");
    await assertSucceeds(set(ref(donor, "blood_contact_shares/request-live/donor-1"), contactShare));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database(), "blood_requests/request-live"), {
        status: "completed",
        updatedAt: now + 1,
      });
    });
    await assertFails(get(ref(operator, "blood_contact_shares/request-live/donor-1")));
    await assertSucceeds(get(ref(donor, "blood_contact_shares/request-live/donor-1")));
    await assertSucceeds(remove(ref(donor, "blood_contact_shares/request-live/donor-1")));
  });

  it("allows operator audit and notes to be appended once and prevents overwrites", async () => {
    const operator = dbFor("operator-1");
    const event = {
      id: "event-1",
      requestId: "request-active",
      action: "view_requester_private",
      actorUid: "operator-1",
      actorName: "Operator One",
      createdAt: now,
      detail: "private requester details opened",
    };
    const note = {
      id: "note-1",
      requestId: "request-active",
      kind: "verification",
      text: "তথ্য যাচাই করা হয়েছে",
      actorUid: "operator-1",
      actorName: "Operator One",
      createdAt: now,
    };
    await assertSucceeds(set(ref(operator, "blood_partner_audit/request-active/event-1"), event));
    await assertFails(set(ref(operator, "blood_partner_audit/request-active/event-1"), event));
    await assertSucceeds(set(ref(operator, "blood_partner_ops/request-active/notes/note-1"), note));
    await assertFails(remove(ref(operator, "blood_partner_ops/request-active/notes/note-1")));
  });

  it("lets users request blood-only access but reserves approval, role assignment and revocation for the project admin", async () => {
    const applicant = dbFor("operator-applicant-1", { email: "applicant@example.test" });
    const accessRequest = {
      uid: "operator-applicant-1",
      email: "applicant@example.test",
      displayName: "Applicant One",
      organizationName: "স্থানীয় রক্তসেবা সংস্থা",
      phone: "01700000001",
      status: "pending",
      requestedAt: now,
      revisionId: "operator-applicant-revision-1",
    };
    await assertSucceeds(set(ref(applicant, "blood_partner_access_requests/operator-applicant-1"), accessRequest));
    await assertFails(update(ref(applicant, "blood_partner_access_requests/operator-applicant-1"), { status: "approved" }));
    await assertFails(set(ref(applicant, "blood_partner_access/operator-2"), {
      ...activeMembership,
      uid: "operator-2",
    }));
    await assertFails(get(ref(applicant, "blood_partner_access_requests/operator-2")));
    await assertSucceeds(remove(ref(applicant, "blood_partner_access_requests/operator-applicant-1")));
    await assertSucceeds(set(ref(applicant, "blood_partner_access_requests/operator-applicant-1"), accessRequest));

    const owner = dbFor("owner-1", { admin: true, email: "admin@gmail.com" });
    await assertFails(set(ref(owner, "blood_partner_access_requests/operator-applicant-1"), {
      ...accessRequest,
      status: "approved",
      reviewedAt: now,
      reviewedBy: "owner-1",
    }));
    await assertFails(update(ref(owner, "blood_partner_access_requests/operator-applicant-1"), {
      status: "approved",
      reviewedAt: now,
      reviewedBy: "owner-1",
    }));
    const requestRef = ref(owner, "blood_partner_access_requests/operator-applicant-1");
    const pendingBeforeLock = await get(requestRef);
    let firstLockCallback = true;
    const lock = await runTransaction(requestRef, (current) => {
      const latest = current ?? (firstLockCallback ? pendingBeforeLock.val() : null);
      firstLockCallback = false;
      if (!latest || latest.status !== "pending" || latest.reviewDecision) return;
      return { ...latest, reviewDecision: "approved", reviewStartedAt: now, reviewStartedBy: "owner-1" };
    });
    expect(lock.committed).toBe(true);
    await assertFails(set(ref(applicant, "blood_partner_access_requests/operator-applicant-1"), {
      ...accessRequest,
      organizationName: "পরিবর্তিত সংস্থা",
    }));

    const competingOwner = dbFor("owner-2", { admin: true, email: "second-admin@example.test" });
    const beforeCompetingDecision = await get(ref(competingOwner, "blood_partner_access_requests/operator-applicant-1"));
    let firstCompetingCallback = true;
    const competingDecision = await runTransaction(ref(competingOwner, "blood_partner_access_requests/operator-applicant-1"), (current) => {
      const latest = current ?? (firstCompetingCallback ? beforeCompetingDecision.val() : null);
      firstCompetingCallback = false;
      if (!latest || latest.status !== "pending" || latest.reviewDecision) return;
      return { ...latest, reviewDecision: "rejected", reviewStartedAt: now, reviewStartedBy: "owner-2" };
    });
    expect(competingDecision.committed).toBe(false);

    const approvedMembership = {
      ...activeMembership,
      uid: "operator-applicant-1",
      email: accessRequest.email,
      displayName: accessRequest.displayName,
      organizationName: accessRequest.organizationName,
      createdBy: "owner-1",
      updatedBy: "owner-1",
      createdAt: now,
      updatedAt: now,
    };
    const auditApproved = {
      actorUid: "owner-1",
      action: "blood_operator_access_approved",
      target: "blood_partner_access/operator-applicant-1",
      before: JSON.stringify({ uid: "operator-applicant-1", status: "pending" }),
      after: JSON.stringify({ uid: "operator-applicant-1", role: "blood_operator", scope: "pathargata_all", active: true }),
      reason: "Blood operator application approved",
      requestId: "approve-operator-applicant-1",
      timestamp: now,
      result: "approved",
    };
    await assertSucceeds(update(ref(owner), {
      "blood_partner_access/operator-applicant-1": approvedMembership,
      "blood_partner_access_requests/operator-applicant-1/status": "approved",
      "blood_partner_access_requests/operator-applicant-1/reviewedAt": now,
      "blood_partner_access_requests/operator-applicant-1/reviewedBy": "owner-1",
      "blood_partner_access_requests/operator-applicant-1/reviewDecision": null,
      "blood_partner_access_requests/operator-applicant-1/reviewStartedAt": null,
      "blood_partner_access_requests/operator-applicant-1/reviewStartedBy": null,
      "super_admin_audit/approve-operator-applicant-1": auditApproved,
    }));

    const applicantTwo = dbFor("operator-applicant-2", { email: "applicant-two@example.test" });
    const rejectedRequest = { ...accessRequest, uid: "operator-applicant-2", email: "applicant-two@example.test", requestedAt: now, revisionId: "operator-applicant-revision-2" };
    await assertSucceeds(set(ref(applicantTwo, "blood_partner_access_requests/operator-applicant-2"), rejectedRequest));
    const beforeRejection = await get(ref(owner, "blood_partner_access_requests/operator-applicant-2"));
    let firstRejectionCallback = true;
    const rejectionLock = await runTransaction(ref(owner, "blood_partner_access_requests/operator-applicant-2"), (current) => {
      const latest = current ?? (firstRejectionCallback ? beforeRejection.val() : null);
      firstRejectionCallback = false;
      if (!latest || latest.status !== "pending" || latest.reviewDecision) return;
      return { ...latest, reviewDecision: "rejected", reviewStartedAt: now, reviewStartedBy: "owner-1" };
    });
    expect(rejectionLock.committed).toBe(true);
    const beforeResume = await get(ref(competingOwner, "blood_partner_access_requests/operator-applicant-2"));
    let firstResumeCallback = true;
    const resumedRejection = await runTransaction(ref(competingOwner, "blood_partner_access_requests/operator-applicant-2"), (current) => {
      const latest = current ?? (firstResumeCallback ? beforeResume.val() : null);
      firstResumeCallback = false;
      if (!latest || latest.status !== "pending" || latest.reviewDecision !== "rejected") return;
      return latest;
    });
    expect(resumedRejection.committed).toBe(true);
    const auditRejected = {
      actorUid: "owner-1",
      action: "blood_operator_access_rejected",
      target: "blood_partner_access_requests/operator-applicant-2",
      before: JSON.stringify({ uid: "operator-applicant-2", status: "pending" }),
      after: JSON.stringify({ uid: "operator-applicant-2", status: "rejected" }),
      reason: "Blood operator application rejected",
      requestId: "reject-operator-applicant-2",
      timestamp: now,
      result: "rejected",
    };
    await assertSucceeds(update(ref(owner), {
      "blood_partner_access_requests/operator-applicant-2/status": "rejected",
      "blood_partner_access_requests/operator-applicant-2/reviewedAt": now,
      "blood_partner_access_requests/operator-applicant-2/reviewedBy": "owner-1",
      "blood_partner_access_requests/operator-applicant-2/reviewDecision": null,
      "blood_partner_access_requests/operator-applicant-2/reviewStartedAt": null,
      "blood_partner_access_requests/operator-applicant-2/reviewStartedBy": null,
      "super_admin_audit/reject-operator-applicant-2": auditRejected,
    }));
    const rejectedMembership = await get(ref(owner, "blood_partner_access/operator-applicant-2"));
    expect(rejectedMembership.exists()).toBe(false);
    await assertSucceeds(set(ref(applicantTwo, "blood_partner_access_requests/operator-applicant-2"), {
      ...rejectedRequest,
      requestedAt: now + 1,
      revisionId: "operator-applicant-revision-2-resubmission",
    }));
    const beforeStaleDecision = await get(ref(owner, "blood_partner_access_requests/operator-applicant-2"));
    let firstStaleCallback = true;
    const staleDecision = await runTransaction(ref(owner, "blood_partner_access_requests/operator-applicant-2"), (current) => {
      const latest = current ?? (firstStaleCallback ? beforeStaleDecision.val() : null);
      firstStaleCallback = false;
      if (!latest || latest.status !== "pending" || latest.revisionId !== rejectedRequest.revisionId) return;
      return { ...latest, reviewDecision: "approved", reviewStartedAt: now + 2, reviewStartedBy: "owner-1" };
    });
    expect(staleDecision.committed).toBe(false);
    const legacyRequestRef = ref(owner, "blood_partner_access_requests/applicant-1");
    const legacyBeforeLock = await get(legacyRequestRef);
    const legacyRevision = `legacy:${legacyBeforeLock.val().requestedAt}`;
    let firstLegacyCallback = true;
    const legacyLock = await runTransaction(legacyRequestRef, (current) => {
      const latest = current ?? (firstLegacyCallback ? legacyBeforeLock.val() : null);
      firstLegacyCallback = false;
      if (!latest || latest.status !== "pending" || latest.reviewDecision) return;
      return { ...latest, revisionId: legacyRevision, reviewDecision: "rejected", reviewStartedAt: now + 3, reviewStartedBy: "owner-1" };
    });
    expect(legacyLock.committed).toBe(true);
    expect(legacyLock.snapshot.val().revisionId).toBe(legacyRevision);

    await assertSucceeds(set(ref(owner, "blood_partner_access/operator-2"), {
      ...activeMembership,
      uid: "operator-2",
      email: "operator-two@example.test",
      createdBy: "owner-1",
      updatedBy: "owner-1",
    }));
    await assertSucceeds(update(ref(owner, "blood_partner_access/operator-2"), {
      active: false,
      updatedAt: now + 1,
      updatedBy: "owner-1",
    }));
  });
});
