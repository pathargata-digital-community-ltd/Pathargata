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
  requestType: "suggestion",
  title: "নতুন পর্যটন স্থান",
  category: "nature",
  details: "স্থানটির সংক্ষিপ্ত বিবরণ",
  address: "",
  locality: "পাথরঘাটা",
  phone: "",
  openingHours: "",
  admissionFee: "",
  estimatedDuration: "",
  uid: "user-a",
  author: "কমিউনিটি সদস্য",
  timestamp: 1_700_000_000_000,
  status: "open",
  moderationStatus: "pending",
};

describe("Realtime Database Tourism contribution rules", () => {
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

  it("allows an authenticated community member to submit a suggestion without optional placeId or rating", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-1"), request),
    );
  });

  it("accepts the empty images array that the mobile form sends for text-only review and report submissions", async () => {
    await assertSucceeds(set(ref(dbFor("user-a"), "service_requests/tourism/request-review-no-photo"), {
      ...request,
      requestType: "review",
      title: "পর্যটন স্থান",
      details: "",
      placeId: "place-1",
      rating: 5,
      images: [],
    }));
    await assertSucceeds(set(ref(dbFor("user-a"), "service_requests/tourism/request-report-no-photo"), {
      ...request,
      requestType: "report",
      images: [],
    }));
  });

  it("denies unauthenticated, tourist, spoofed-owner and pre-moderated submissions", async () => {
    await assertFails(
      set(ref(testEnv.unauthenticatedContext().database(), "service_requests/tourism/request-anon"), request),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "service_requests/tourism/request-tourist"), {
        ...request,
        uid: "user-b",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "service_requests/tourism/request-spoofed"), request),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-approved"), {
        ...request,
        moderationStatus: "approved",
      }),
    );
  });

  it("keeps submissions admin-only for reading and moderation", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-private"), request),
    );
    await assertFails(get(ref(dbFor("user-a"), "service_requests/tourism/request-private")));
    await assertSucceeds(get(ref(dbFor("admin-1"), "service_requests/tourism/request-private")));
    await assertFails(
      update(ref(dbFor("user-a"), "service_requests/tourism/request-private"), {
        status: "resolved",
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "service_requests/tourism/request-private"), {
        status: "approved",
        moderationStatus: "approved",
      }),
    );
  });

  it("allows atomic Admin publication and audit for a pending suggestion only once", async () => {
    await set(ref(dbFor("user-a"), "service_requests/tourism/request-publish"), request);
    const timestamp = Date.now();
    const audit = {
      actorUid: "admin-1",
      action: "tourism_suggestion_approved",
      target: "service_requests/tourism/request-publish",
      before: JSON.stringify({ status: "open", moderationStatus: "pending" }),
      after: JSON.stringify({ status: "approved", moderationStatus: "approved" }),
      reason: "Tourism contribution review",
      requestId: "tourism-test-audit-event",
      timestamp,
      result: "approved",
    };
    await assertSucceeds(update(ref(dbFor("admin-1")), {
      "service_requests/tourism/request-publish/status": "approved",
      "service_requests/tourism/request-publish/moderationStatus": "approved",
      "service_requests/tourism/request-publish/reviewedAt": timestamp,
      "service_requests/tourism/request-publish/reviewedBy": "admin-1",
      "service_requests/tourism/request-publish/publicRecordId": "contribution-request-publish",
      "services/data/history_tourism/contribution-request-publish": {
        title: request.title,
        details: request.details,
        category: request.category,
        locality: request.locality,
        updatedAt: timestamp,
        is_verified: true,
      },
      "super_admin_audit/tourism-test-audit-event": audit,
    }));
    await assertSucceeds(
      get(ref(dbFor("user-a"), "services/data/history_tourism/contribution-request-publish")),
    );
    await assertFails(update(ref(dbFor("admin-1")), {
      "service_requests/tourism/request-publish/status": "rejected",
      "service_requests/tourism/request-publish/moderationStatus": "rejected",
    }));
    await assertFails(set(
      ref(dbFor("user-a"), "services/data/history_tourism/user-forged"),
      { title: "অযাচাইকৃত", details: "ইউজার নিজে যোগ করেছে", category: "nature" },
    ));
  });

  it("rejects invalid place identifiers, ratings and image hosts", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-bad-place"), {
        ...request,
        placeId: "",
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-bad-rating"), {
        ...request,
        requestType: "review",
        rating: 6,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-bad-image"), {
        ...request,
        images: ["https://example.com/image.jpg"],
      }),
    );
    await assertSucceeds(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-valid-image"), {
        ...request,
        images: ["https://res.cloudinary.com/demo/image/upload/photo.jpg"],
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "service_requests/tourism/request-too-many-images"), {
        ...request,
        images: [
          "https://res.cloudinary.com/demo/image/upload/1.jpg",
          "https://res.cloudinary.com/demo/image/upload/2.jpg",
          "https://res.cloudinary.com/demo/image/upload/3.jpg",
          "https://res.cloudinary.com/demo/image/upload/4.jpg",
        ],
      }),
    );
  });
});
