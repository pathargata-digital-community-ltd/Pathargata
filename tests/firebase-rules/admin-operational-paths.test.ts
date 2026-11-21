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
  const claims = (uid.startsWith("admin") || uid.startsWith("superadmin"))
    ? { admin: true }
    : {};
  return testEnv.authenticatedContext(uid, claims).database();
}
function claimAdminDb() {
  return testEnv.authenticatedContext("claim-admin", { admin: true }).database();
}
const post = {
  uid: "user-a",
  title: "Test post",
  body: "Post body",
  timestamp: 1_700_000_000_000,
  type: "text",
};

const archivedPost = {
  type: "post",
  data: post,
  deletedBy: "user-a",
  deletedAt: 1_700_000_000_100,
  expiresAt: 1_700_000_000_100 + 30 * 24 * 60 * 60 * 1000,
  timestamp: 1_700_000_000_100,
};

describe("Realtime Database admin and operational path rules", () => {
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
      await set(ref(database, "users/superadmin-1"), {
        uid: "superadmin-1",
        role: "admin",
        status: "user",
      });
      await set(ref(database, "users/superadmin-2"), {
        uid: "superadmin-2",
        role: "admin",
        status: "user",
      });
      await set(ref(database, "users/role-only-admin"), {
        uid: "role-only-admin",
        role: "admin",
        status: "user",
      });
      await set(ref(database, "posts/post-1"), post);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows only the post owner to archive a post; admin uses trusted callables", async () => {
    await assertSucceeds(
      set(ref(dbFor("user-a"), "trash_bin/user-a/post-1"), archivedPost),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "trash_bin/user-b/post-1"), {
        ...archivedPost,
        deletedBy: "user-b",
        data: { ...post, uid: "user-a" },
      }),
    );
    await assertFails(
      set(ref(dbFor("admin-1"), "trash_bin/user-a/post-1"), {
        ...archivedPost,
      }),
    );
  });

  it("lets a user read only their own feedback history and lets an admin review it", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      await set(ref(database, "feedback_submissions/feedback-a"), {
        uid: "user-a", email: "a@example.com", type: "feedback", title: "A", details: "Details A", status: "pending", timestamp: 1_700_000_000_000,
      });
      await set(ref(database, "feedback_submissions/feedback-b"), {
        uid: "user-b", email: "b@example.com", type: "missing", title: "B", details: "Details B", status: "pending", timestamp: 1_700_000_000_001,
      });
    });

    await assertSucceeds(get(query(ref(dbFor("user-a"), "feedback_submissions"), orderByChild("uid"), equalTo("user-a"))));
    await assertFails(get(query(ref(dbFor("user-a"), "feedback_submissions"), orderByChild("uid"), equalTo("user-b"))));
    await assertFails(get(ref(dbFor("user-b"), "feedback_submissions/feedback-a")));
    await assertSucceeds(update(ref(dbFor("admin-1"), "feedback_submissions/feedback-a"), { status: "resolved", adminReply: "সমাধান করা হয়েছে", updatedAt: 1_700_000_000_100 }));
    await assertFails(update(ref(dbFor("user-a"), "feedback_submissions/feedback-a"), { status: "resolved" }));
  });

  it("allows authenticated Directory reads while keeping Directory writes admin-only", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "directory/health/hospital-1"), {
        name: "পাথরঘাটা হাসপাতাল",
        address: "পাথরঘাটা",
        is_active: true,
      });
    });

    await assertSucceeds(get(ref(dbFor("user-a"), "directory/health")));
    await assertFails(get(ref(testEnv.unauthenticatedContext().database(), "directory/health")));
    await assertFails(set(ref(dbFor("user-a"), "directory/health/hospital-2"), { name: "অননুমোদিত" }));
    await assertSucceeds(set(ref(dbFor("admin-1"), "directory/health/hospital-2"), { name: "অনুমোদিত" }));
  });

  it("rejects malformed or orphaned trash records", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "trash_bin/user-a/post-2"), {
        ...archivedPost,
        data: { ...post, uid: "user-b" },
      }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "trash_bin/user-a/post-3"), {
        type: "post",
        deletedBy: "user-a",
        deletedAt: 1_700_000_000_100,
        expiresAt: 1_700_000_000_100 + 30 * 24 * 60 * 60 * 1000,
        timestamp: "not-a-number",
      }),
    );
  });

  it("keeps story trash, tracking, and registered devices admin-write-only", async () => {
    for (const pathName of [
      "story_trash/story-1",
      "tracking/log-1",
      "registered_devices/device-1",
    ]) {
      await assertFails(
        set(ref(dbFor("user-a"), pathName), { uid: "user-a", timestamp: 1_700_000_000_000 }),
      );
      await assertSucceeds(
        set(ref(dbFor("admin-1"), pathName), { uid: "user-a", timestamp: 1_700_000_000_000 }),
      );
    }
  });

  it("keeps the bounded trash expiry queue server-write-only", async () => {
    await assertFails(get(ref(dbFor("user-a"), "trashExpiryQueue")));
    await assertSucceeds(get(ref(dbFor("admin-1"), "trashExpiryQueue")));
    await assertFails(
      set(ref(dbFor("admin-1"), "trashExpiryQueue/queue-1"), {
        uid: "user-a",
        postId: "post-1",
        expiresAt: 1_700_000_000_000,
        indexedAt: 1_700_000_000_000,
      }),
    );
  });

  it("requires the exact admin email and rejects other emails", async () => {
    await assertFails(
      get(ref(dbFor("role-only-admin"), "story_trash")),
    );
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "story_trash/claim-admin-story"), {
        uid: "user-a",
        timestamp: 1_700_000_000_000,
      }),
    );
  });

  it("allows a Firebase admin custom claim to read operational data", async () => {
    await assertSucceeds(get(ref(claimAdminDb(), "users/user-a")));
    await assertSucceeds(get(ref(claimAdminDb(), "admin_settings")));
  });

  it("allows only the configured admin email to set the public app download URL", async () => {
    await assertFails(
      set(ref(dbFor("user-a"), "admin_settings/app_download_url"), "https://example.org/app.apk"),
    );
    await assertFails(
      set(ref(dbFor("role-only-admin"), "admin_settings/app_download_url"), "https://example.org/app.apk"),
    );
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "admin_settings/app_download_url"), "https://example.org/app.apk"),
    );
  });

  it("allows only a configured email admin to publish a valid app maintenance notice", async () => {
    const maintenance = {
      enabled: true,
      message: "সার্ভার রক্ষণাবেক্ষণ চলছে। পরে আবার চেষ্টা করুন।",
      updatedAt: 1_700_000_000_000,
      updatedBy: "admin-1",
    };
    await assertFails(set(ref(dbFor("user-a"), "admin_settings/app_maintenance"), maintenance));
    await assertFails(set(ref(dbFor("role-only-admin"), "admin_settings/app_maintenance"), { ...maintenance, updatedBy: "role-only-admin" }));
    await assertFails(set(ref(dbFor("admin-1"), "admin_settings/app_maintenance"), maintenance));
    await assertSucceeds(get(ref(testEnv.unauthenticatedContext().database(), "admin_settings/app_maintenance")));
    await assertFails(set(ref(dbFor("admin-1"), "admin_settings/app_maintenance"), { ...maintenance, updatedBy: "user-a" }));
    await assertFails(set(ref(dbFor("admin-1"), "admin_settings/app_maintenance"), { ...maintenance, message: "x".repeat(301) }));
  });

  it("allows a Super Admin to create an immutable rollback snapshot only once", async () => {
    const snapshot = {
      snapshotId: "snapshot-1",
      targetPath: "admin_settings/app_maintenance",
      beforeState: JSON.stringify({ enabled: false }),
      requestedAfterState: JSON.stringify({ enabled: true }),
      requesterUid: "superadmin-1",
      createdAt: 1_700_000_000_000,
      reason: "জরুরি maintenance test",
      requestId: "request-1",
      status: "applied",
    };

    await assertFails(set(ref(dbFor("admin-1"), "super_admin_rollback_snapshots/snapshot-1"), snapshot));
    await assertSucceeds(set(ref(dbFor("superadmin-1"), "super_admin_rollback_snapshots/snapshot-1"), snapshot));
    await assertFails(update(ref(dbFor("superadmin-1"), "super_admin_rollback_snapshots/snapshot-1"), { reason: "edited" }));
    await assertFails(set(ref(dbFor("superadmin-1"), "super_admin_rollback_snapshots/snapshot-1"), { ...snapshot, status: "rolled_back" }));
    await assertFails(set(ref(dbFor("superadmin-1"), "super_admin_rollback_snapshots/snapshot-1"), null));
    await assertSucceeds(get(ref(dbFor("superadmin-1"), "super_admin_rollback_snapshots/snapshot-1")));
  });

  it("requires a different Super Admin to approve global maintenance before apply", async () => {
    const request = {
      requestId: "approval-1",
      targetPath: "admin_settings/app_maintenance",
      requestedAfterState: JSON.stringify({ enabled: true, message: "জরুরি update" }),
      requesterUid: "superadmin-1",
      createdAt: 1_700_000_000_000,
      reason: "জরুরি maintenance",
      status: "pending",
    };
    const approved = {
      ...request,
      status: "approved",
      approverUid: "superadmin-2",
      actedAt: 1_700_000_000_100,
      decisionReason: "পর্যালোচনা সম্পন্ন",
    };
    const finalMaintenance = {
      enabled: true,
      message: "জরুরি update",
      updatedAt: 1_700_000_000_200,
      updatedBy: "superadmin-2",
      approvalId: "approval-1",
      requestedBy: "superadmin-1",
      approvedBy: "superadmin-2",
      approvalStatus: "approved",
      approvedAt: 1_700_000_000_100,
    };

    await assertSucceeds(set(ref(dbFor("superadmin-1"), "super_admin_approval_requests/approval-1"), request));
    await assertFails(update(ref(dbFor("superadmin-1"), "super_admin_approval_requests/approval-1"), approved));
    await assertSucceeds(update(ref(dbFor("superadmin-2"), "super_admin_approval_requests/approval-1"), approved));
    await assertFails(set(ref(dbFor("superadmin-1"), "admin_settings/app_maintenance"), finalMaintenance));
    await assertSucceeds(set(ref(dbFor("superadmin-2"), "admin_settings/app_maintenance"), finalMaintenance));
    await assertFails(update(ref(dbFor("superadmin-2"), "super_admin_approval_requests/approval-1"), { status: "rejected" }));
  });

  it("allows requester cancellation and only time-qualified expiry", async () => {
    const cancellable = {
      requestId: "approval-cancel",
      targetPath: "marketplace_controls",
      requestedAfterState: JSON.stringify({ checkoutEnabled: false }),
      requesterUid: "superadmin-1",
      createdAt: 1_700_000_000_000,
      reason: "পরীক্ষামূলক pause",
      status: "pending",
    };
    const cancelled = {
      ...cancellable,
      status: "cancelled",
      cancelledBy: "superadmin-1",
      actedAt: 1_700_000_000_100,
      decisionReason: "পরিকল্পনা বাতিল",
    };
    await assertSucceeds(set(ref(dbFor("superadmin-1"), "super_admin_approval_requests/approval-cancel"), cancellable));
    await assertSucceeds(update(ref(dbFor("superadmin-1"), "super_admin_approval_requests/approval-cancel"), cancelled));

    const recentExpirable = {
      ...cancellable,
      requestId: "approval-expire-recent",
      createdAt: Date.now(),
      status: "pending",
    };
    const recentExpired = {
      ...recentExpirable,
      status: "expired",
      expiredBy: "superadmin-2",
      actedAt: 1_700_000_000_100,
      decisionReason: "সময় অতিক্রম করেছে",
    };
    await assertSucceeds(set(ref(dbFor("superadmin-1"), "super_admin_approval_requests/approval-expire-recent"), recentExpirable));
    await assertFails(update(ref(dbFor("superadmin-2"), "super_admin_approval_requests/approval-expire-recent"), recentExpired));

    const staleExpirable = { ...recentExpirable, requestId: "approval-expire-stale", createdAt: 1 };
    const staleExpired = { ...recentExpired, ...staleExpirable, status: "expired", expiredBy: "superadmin-2", actedAt: 1_700_000_000_100, decisionReason: "সময় অতিক্রম করেছে" };
    await assertSucceeds(set(ref(dbFor("superadmin-1"), "super_admin_approval_requests/approval-expire-stale"), staleExpirable));
    await assertSucceeds(update(ref(dbFor("superadmin-2"), "super_admin_approval_requests/approval-expire-stale"), staleExpired));
  });

  it("allows only a configured email admin to set a valid AI assistant toggle record", async () => {
    const aiSettings = { enabled: false, updatedAt: 1_700_000_000_000, updatedBy: "admin-1" };
    await assertFails(set(ref(dbFor("user-a"), "admin_settings/ai_assistant"), aiSettings));
    await assertFails(set(ref(dbFor("role-only-admin"), "admin_settings/ai_assistant"), { ...aiSettings, updatedBy: "role-only-admin" }));
    await assertSucceeds(set(ref(dbFor("admin-1"), "admin_settings/ai_assistant"), aiSettings));
    await assertSucceeds(get(ref(dbFor("user-a"), "admin_settings/ai_assistant")));
    await assertFails(set(ref(dbFor("admin-1"), "admin_settings/ai_assistant"), { ...aiSettings, enabled: "true" }));
    await assertFails(set(ref(dbFor("admin-1"), "admin_settings/ai_assistant"), { ...aiSettings, updatedBy: "user-a" }));
  });

  it("lets a registration screen read the privacy policy URL before authentication", async () => {
    await assertSucceeds(set(ref(dbFor("admin-1"), "admin_settings/privacy_link"), "https://example.org/privacy"));
    await assertSucceeds(get(ref(testEnv.unauthenticatedContext().database(), "admin_settings/privacy_link")));
    await assertFails(set(ref(dbFor("user-a"), "admin_settings/privacy_link"), "https://example.org/unauthorized"));
    await assertFails(set(ref(dbFor("admin-1"), "admin_settings/privacy_link"), "javascript:alert(1)"));
  });

  it("allows the public website to read published settings without exposing admin writes", async () => {
    const websiteSettings = {
      liveVersion: "3.2.0",
      downloadLink: "https://example.org/pathargata.apk",
      webViewLink: "https://example.org/web",
      stats: { users: "100", rating: "4.9", unions: "7", donors: "50" },
    };
    await assertSucceeds(set(ref(dbFor("admin-1"), "siteData"), websiteSettings));
    await assertSucceeds(get(ref(testEnv.unauthenticatedContext().database(), "siteData")));
    await assertFails(set(ref(testEnv.unauthenticatedContext().database(), "siteData/liveVersion"), "tampered"));

    await assertSucceeds(set(ref(dbFor("admin-1"), "admin_settings/app_screenshots/screenshot-1"), "https://example.org/screenshot.webp"));
    await assertSucceeds(get(ref(testEnv.unauthenticatedContext().database(), "admin_settings/app_screenshots")));
    await assertSucceeds(set(ref(dbFor("admin-1"), "admin_settings/rules_link"), "https://example.org/terms"));
    await assertSucceeds(set(ref(dbFor("admin-1"), "admin_settings/links/help"), "https://example.org/help"));
    await assertSucceeds(get(ref(testEnv.unauthenticatedContext().database(), "admin_settings/rules_link")));
    await assertSucceeds(get(ref(testEnv.unauthenticatedContext().database(), "admin_settings/links/help")));
  });
});
