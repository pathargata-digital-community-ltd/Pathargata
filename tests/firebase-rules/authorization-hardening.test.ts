import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { ref, set, update } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const rules = fs.readFileSync(path.resolve(process.cwd(), "database.rules.json"), "utf8");
let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  const claims = uid.startsWith("admin") ? { admin: true } : {};
  return testEnv.authenticatedContext(uid, claims).database();
}

describe("Realtime Database authorization hardening", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "pathargata-authorization-hardening-test",
      database: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      for (const uid of ["user-a", "user-b", "user-c", "seller-1", "other-1"]) {
        await set(ref(database, `users/${uid}`), {
          uid,
          role: "user",
          status: "user",
          accountAccess: "approved",
          accessReview: "not_required",
          isVerified: false,
        });
      }
      await set(ref(database, "friend_requests/user-a/user-b"), {
        fromUid: "user-b",
        timestamp: 1_700_000_000_000,
      });
      await set(ref(database, "market_shops/shop-1"), {
        uid: "seller-1",
        title: "Test shop",
      });
      await set(ref(database, "market_items/item-1"), {
        uid: "seller-1",
        shopId: "shop-1",
        title: "Test item",
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("requires a real incoming request before creating a friendship", async () => {
    await assertFails(
      set(ref(dbFor("user-b"), "users/user-a/friends/user-b"), true),
    );
    await assertSucceeds(
      update(ref(dbFor("user-a")), {
        "users/user-a/friends/user-b": true,
        "users/user-b/friends/user-a": true,
        "friend_requests/user-a/user-b": null,
      }),
    );
  });

  it("rejects forged friend request sender identities", async () => {
    await assertFails(
      set(ref(dbFor("user-b"), "friend_requests/user-a/user-b"), {
        fromUid: "user-c",
        timestamp: 1_700_000_000_100,
      }),
    );
    await assertFails(
      set(ref(dbFor("user-b"), "friend_requests/user-b/user-a"), {
        fromUid: "user-a",
        timestamp: 1_700_000_000_200,
      }),
    );
  });

  it("keeps donor private records schema-bound and UID-bound", async () => {
    const donor = {
      uid: "user-a",
      name: "User A",
      bloodGroup: "A+",
      phone: "01700000000",
      lastDate: "2026-01-01",
      serviceArea: "Pathargata",
      receiveBloodRequestNotifications: true,
      temporarilyUnavailable: false,
      consentUpdatedAt: 1_700_000_000_000,
      timestamp: 1_700_000_000_000,
    };
    await assertSucceeds(set(ref(dbFor("user-a"), "donors/user-a"), donor));
    await assertFails(
      update(ref(dbFor("user-a"), "donors/user-a"), { phone: "not-a-phone" }),
    );
    await assertFails(
      set(ref(dbFor("user-a"), "donors/user-b"), { ...donor, uid: "user-b" }),
    );
  });

  it("does not allow marketplace ownership reassignment", async () => {
    await assertFails(
      update(ref(dbFor("seller-1"), "market_items/item-1"), { uid: "other-1" }),
    );
    await assertFails(
      update(ref(dbFor("seller-1"), "market_shops/shop-1"), { uid: "other-1" }),
    );
    await assertFails(
      update(ref(dbFor("other-1"), "market_items/item-1"), { title: "Hijacked" }),
    );
  });

  it("requires a seller-owned shop for new marketplace products", async () => {
    await assertFails(
      set(ref(dbFor("seller-1"), "market_items/item-without-shop"), {
        uid: "seller-1",
        title: "Unlisted item",
      }),
    );
    await assertSucceeds(
      set(ref(dbFor("seller-1"), "market_items/item-with-shop"), {
        uid: "seller-1",
        shopId: "shop-1",
        title: "Listed item",
      }),
    );
  });
});
