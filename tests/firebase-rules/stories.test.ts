import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const rules = fs.readFileSync(path.resolve(process.cwd(), "database.rules.json"), "utf8");
let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  const claims = uid.startsWith("admin") ? { admin: true } : {};
  return testEnv.authenticatedContext(uid, claims).database();
}

describe("Realtime Database story reaction rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "pathargata-story-rules-test",
      database: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      await set(ref(database, "users/owner"), { uid: "owner", status: "user" });
      await set(ref(database, "users/reactor"), { uid: "reactor", status: "user" });
      await set(ref(database, "users/stranger"), { uid: "stranger", status: "user" });
      await set(ref(database, "users/admin-1"), { uid: "admin-1", status: "user" });
      await set(ref(database, "stories/story-1"), {
        uid: "owner",
        text: "Public story",
        timestamp: Date.now(),
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows a user to add their own reaction to another user's story", async () => {
    await assertSucceeds(set(ref(dbFor("reactor"), "stories/story-1/reactions/reactor"), "❤️"));
    await assertFails(set(ref(dbFor("reactor"), "stories/story-1/reactions/owner"), "❤️"));
    await assertFails(set(ref(dbFor("reactor"), "stories/story-1/reactions/reactor"), { uid: "owner", value: "❤️" }));
  });

  it("does not let a non-owner edit the story payload or delete an active story", async () => {
    await assertFails(set(ref(dbFor("reactor"), "stories/story-1/text"), "spoofed story"));
    await assertFails(set(ref(dbFor("reactor"), "stories/story-1"), {
      uid: "owner",
      text: "spoofed story",
      timestamp: Date.now(),
    }));
    await assertFails(set(ref(dbFor("reactor"), "stories/story-1"), null));
  });

  it("retains owner and admin story management", async () => {
    await assertSucceeds(set(ref(dbFor("owner"), "stories/story-1/text"), "updated story"));
    await assertSucceeds(set(ref(dbFor("admin-1"), "stories/story-1/text"), "moderated story"));
    await assertSucceeds(get(ref(dbFor("reactor"), "stories/story-1")));
  });
});
