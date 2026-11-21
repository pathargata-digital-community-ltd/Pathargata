import { describe, expect, it } from "vitest";
import {
  chatMembershipReport,
  peopleIndexReport,
} from "../scripts/production-audit.mjs";

describe("production data audit utility", () => {
  it("builds a private-field-free people index dry-run report", () => {
    const report = peopleIndexReport(
      {
        users: {
          "user-a": {
            uid: "user-a",
            name: "User A",
            email: "private@example.test",
            phone: "01700000000",
            status: "user",
            settings: { tagPermission: "friends", profileVisibility: "everyone" },
          },
          "user-deleted": { uid: "user-deleted", status: "deleted" },
        },
      },
      5,
    );

    expect(report.dryRun).toBe(true);
    expect(report.sourceUserCount).toBe(2);
    expect(report.expectedProjectionWrites).toBe(1);
    expect(report.expectedProjectionDeletes).toBe(1);
    expect(report.privateFieldsDetected).toBe(false);
    expect(report.sampleProjections[0].projection).not.toHaveProperty("email");
    expect(report.sampleProjections[0].projection).not.toHaveProperty("phone");
  });

  it("flags invalid chat pairs without producing writes", () => {
    const report = chatMembershipReport(
      {
        chats: {
          alice_bob: { message: { sender: "alice" } },
          alice_bob_extra: { message: { sender: "alice" } },
        },
        user_chats: {
          alice: { bob: { timestamp: 1 } },
          bob: { alice: { timestamp: 1 } },
        },
        user_blocks: {},
      },
      5,
    );

    expect(report.dryRun).toBe(true);
    expect(report.validChatCount).toBe(1);
    expect(report.invalidChatCount).toBe(1);
    expect(report.plannedMembershipWrites).toEqual([
      { path: "chat_members/alice_bob/alice", value: true },
      { path: "chat_members/alice_bob/bob", value: true },
    ]);
  });

  it("rejects blocked pairs from membership provisioning plans", () => {
    const report = chatMembershipReport(
      {
        chats: { alice_bob: { message: { sender: "alice" } } },
        user_chats: {
          alice: { bob: { timestamp: 1 } },
          bob: { alice: { timestamp: 1 } },
        },
        user_blocks: { alice: { bob: true } },
      },
      5,
    );

    expect(report.validChatCount).toBe(0);
    expect(report.invalidChatSample[0].reasons).toContain("participant pair is blocked");
    expect(report.plannedMembershipWrites).toEqual([]);
  });

  it("does not rewrite existing memberships and flags unexpected members", () => {
    const report = chatMembershipReport(
      {
        chats: {
          alice_bob: { message: { sender: "alice" } },
          carol_dave: { message: { sender: "carol" } },
        },
        user_chats: {
          alice: { bob: { timestamp: 1 } },
          bob: { alice: { timestamp: 1 } },
          carol: { dave: { timestamp: 1 } },
          dave: { carol: { timestamp: 1 } },
        },
        user_blocks: {},
        chat_members: {
          alice_bob: { alice: true, bob: true },
          carol_dave: { carol: true, dave: true, outsider: true },
        },
      },
      5,
    );

    expect(report.alreadyProvisionedCount).toBe(1);
    expect(report.membershipConflictCount).toBe(1);
    expect(report.plannedMembershipWrites).toEqual([]);
    expect(report.invalidChatSample[0].reasons).toContain("existing membership includes a non-participant");
  });
});
