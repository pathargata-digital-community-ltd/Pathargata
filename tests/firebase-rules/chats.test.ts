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

const message = {
  sender: "alice",
  timestamp: 1_700_000_000_000,
  status: "sent",
  encryptedText: { ciphertext: "sealed", nonce: "nonce" },
  encryption: "nacl-box-v1",
};

describe("Realtime Database chat rules", () => {
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
      for (const uid of ["alice", "bob", "charlie"]) {
        await set(ref(database, `users/${uid}`), {
          uid,
          role: "user",
          status: "user",
        });
      }
      await set(ref(database, "user_chats/alice/bob"), {
        name: "Bob",
        timestamp: 1_700_000_000_000,
      });
      await set(ref(database, "user_chats/bob/alice"), {
        name: "Alice",
        timestamp: 1_700_000_000_000,
      });
      await set(ref(database, "chat_members/alice_bob/alice"), true);
      await set(ref(database, "chat_members/alice_bob/bob"), true);
      await set(ref(database, "chats/alice_bob/message-1"), message);
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows a participant to create a message with their own sender UID", async () => {
    await assertSucceeds(
      set(ref(dbFor("alice"), "chats/alice_bob/message-2"), message),
    );
  });

  it("denies sender spoofing and non-member reads/writes", async () => {
    await assertFails(
      set(ref(dbFor("alice"), "chats/alice_bob/message-2"), {
        ...message,
        sender: "bob",
      }),
    );
    await assertFails(get(ref(dbFor("charlie"), "chats/alice_bob")));
    await assertFails(set(ref(dbFor("charlie"), "chats/alice_bob/message-3"), { ...message, sender: "charlie" }));
    await assertFails(get(ref(dbFor("ali"), "chats/alice_bob")));
  });

  it("allows a participant to mark an existing message seen without replacing payload", async () => {
    await assertSucceeds(
      update(ref(dbFor("bob"), "chats/alice_bob/message-1"), {
        status: "seen",
      }),
    );
    await assertFails(
      update(ref(dbFor("bob"), "chats/alice_bob/message-1"), {
        encryption: "tampered",
        status: "seen",
      }),
    );
  });

  it("blocks user_chats metadata writes while either participant is blocked", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "user_blocks/alice/bob"), true);
    });
    await assertFails(
      update(ref(dbFor("alice"), "user_chats/alice/bob"), {
        unread: 0,
      }),
    );
    await assertFails(
      update(ref(dbFor("bob"), "user_chats/bob/alice"), {
        unread: 0,
      }),
    );
  });

  it("allows each user to update their own messaging preferences only", async () => {
    await assertSucceeds(set(ref(dbFor("alice"), "users/alice/settings/readReceipts"), true));
    await assertSucceeds(set(ref(dbFor("alice"), "users/alice/settings/messagePrivacy"), "friends"));
    await assertFails(set(ref(dbFor("alice"), "users/bob/settings/readReceipts"), false));
    await assertFails(set(ref(dbFor("alice"), "users/bob/settings/messagePrivacy"), "everyone"));
  });

  it("keeps membership admin-provisioned and rejects UID substring collisions", async () => {
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "chat_members/alice_bob/alice"), true),
    );
    await assertSucceeds(
      set(ref(dbFor("admin-1"), "chat_members/alice_bob/bob"), true),
    );
    await assertSucceeds(
      get(ref(dbFor("alice"), "chat_members/alice_bob")),
    );
    await assertFails(
      get(ref(dbFor("charlie"), "chat_members/alice_bob")),
    );
    await assertFails(
      set(ref(dbFor("alice"), "chat_members/alice_bob/alice"), true),
    );
    await assertFails(
      get(ref(dbFor("ali"), "chat_members/alice_bob")),
    );
    await assertFails(
      set(ref(dbFor("alice"), "chat_members/alice_bob/charlie"), true),
    );
  });
});
