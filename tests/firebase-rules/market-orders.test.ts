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
  const claims = uid.startsWith("admin") ? { admin: true } : {};
  return testEnv.authenticatedContext(uid, claims).database();
}

const order = {
  productId: "item-1",
  productTitle: "Test item",
  productPrice: "100",
  sellerUid: "seller-1",
  sellerName: "Seller",
  buyerUid: "buyer-1",
  buyerName: "Buyer",
  buyerPhone: "01712345678",
  buyerAddress: "Pathargata",
  quantity: 1,
  status: "pending",
  fulfillmentStatus: "pending",
  time: 1_700_000_000_000,
};

describe("Realtime Database marketplace order rules", () => {
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
      await set(ref(database, "users/buyer-1"), {
        uid: "buyer-1",
        role: "user",
        status: "user",
      });
      await set(ref(database, "users/seller-1"), {
        uid: "seller-1",
        role: "user",
        status: "user",
      });
      await set(ref(database, "users/other-1"), {
        uid: "other-1",
        role: "user",
        status: "user",
      });
      await set(ref(database, "users/admin-1"), {
        uid: "admin-1",
        role: "admin",
        status: "user",
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
      await set(ref(database, "market_orders/order-1"), order);
      await set(ref(database, "market_orders/order-2"), order);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows buyer/seller filtered queries but denies unrelated collection reads", async () => {
    await assertSucceeds(
      get(
        query(
          ref(dbFor("buyer-1"), "market_orders"),
          orderByChild("buyerUid"),
          equalTo("buyer-1"),
        ),
      ),
    );
    await assertSucceeds(
      get(
        query(
          ref(dbFor("seller-1"), "market_orders"),
          orderByChild("sellerUid"),
          equalTo("seller-1"),
        ),
      ),
    );
    await assertFails(
      get(
        query(
          ref(dbFor("other-1"), "market_orders"),
          orderByChild("buyerUid"),
          equalTo("buyer-1"),
        ),
      ),
    );
    await assertFails(get(ref(dbFor("other-1"), "market_orders/order-1")));
    await assertSucceeds(get(ref(dbFor("buyer-1"), "market_orders/order-1")));
    await assertSucceeds(get(ref(dbFor("seller-1"), "market_orders/order-1")));
  });

  it("allows an admin to read the order queue and update workflow fields only", async () => {
    await assertSucceeds(get(ref(dbFor("admin-1"), "market_orders")));
    await assertSucceeds(
      update(ref(dbFor("admin-1"), "market_orders/order-1"), {
        status: "cancelled",
        fulfillmentStatus: "cancelled",
        cancellationReason: "স্টক যাচাই ব্যর্থ",
        updatedAt: 1_700_000_000_100,
        updatedBy: "admin-1",
      }),
    );
    await assertFails(
      update(ref(dbFor("admin-1"), "market_orders/order-1"), {
        productId: "item-2",
        fulfillmentStatus: "cancelled",
      }),
    );
    await assertFails(
      update(ref(dbFor("admin-1"), "market_orders/order-1"), {
        buyerUid: "other-1",
        fulfillmentStatus: "cancelled",
      }),
    );
    await assertFails(
      update(ref(dbFor("admin-1"), "market_orders/order-1"), {
        quantity: 99,
        fulfillmentStatus: "cancelled",
      }),
    );
  });

  it("allows a buyer to create a pending order only for a real seller-owned product", async () => {
    await assertSucceeds(
      set(ref(dbFor("buyer-1"), "market_orders/order-3"), order),
    );
    await assertFails(
      set(ref(dbFor("other-1"), "market_orders/order-4"), {
        ...order,
        buyerUid: "buyer-1",
      }),
    );
    await assertFails(
      set(ref(dbFor("buyer-1"), "market_orders/order-5"), {
        ...order,
        sellerUid: "other-1",
      }),
    );
    await assertFails(
      set(ref(dbFor("buyer-1"), "market_orders/order-6"), {
        ...order,
        status: "accepted",
        fulfillmentStatus: "accepted",
      }),
    );
  });

  it("allows only the seller lifecycle and pending buyer cancellation transitions", async () => {
    await assertSucceeds(
      update(ref(dbFor("seller-1"), "market_orders/order-1"), {
        fulfillmentStatus: "accepted",
        status: "pending",
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("seller-1"), "market_orders/order-1"), {
        fulfillmentStatus: "preparing",
        status: "pending",
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("seller-1"), "market_orders/order-1"), {
        fulfillmentStatus: "shipped",
        status: "pending",
      }),
    );
    await assertSucceeds(
      update(ref(dbFor("seller-1"), "market_orders/order-1"), {
        fulfillmentStatus: "delivered",
        status: "delivered",
      }),
    );

    await assertSucceeds(
      update(ref(dbFor("buyer-1"), "market_orders/order-2"), {
        fulfillmentStatus: "cancelled",
        status: "cancelled",
      }),
    );
    await assertFails(
      update(ref(dbFor("seller-1"), "market_orders/order-2"), {
        fulfillmentStatus: "shipped",
        status: "pending",
      }),
    );
  });

  it("prevents changing immutable buyer, seller, product, and quantity fields", async () => {
    await assertFails(
      update(ref(dbFor("seller-1"), "market_orders/order-1"), {
        buyerUid: "other-1",
        fulfillmentStatus: "accepted",
      }),
    );
    await assertFails(
      update(ref(dbFor("buyer-1"), "market_orders/order-1"), {
        quantity: 99,
        fulfillmentStatus: "cancelled",
        status: "cancelled",
      }),
    );
  });

  it("allows authenticated control reads but keeps control writes server-side", async () => {
    await assertSucceeds(get(ref(dbFor("buyer-1"), "marketplace_controls")));
    await assertFails(
      set(ref(dbFor("buyer-1"), "marketplace_controls"), { checkoutEnabled: false }),
    );
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "marketplace_controls"), { checkoutEnabled: false }),
    );
    await assertFails(
      set(ref(dbFor("buyer-1"), "marketplace_metrics/2026-10-29/checkout_success"), { count: 1 }),
    );
    await assertSucceeds(
      get(ref(dbFor("admin-1"), "marketplace_metrics/2026-10-29/checkout_success")),
    );
  });
});
