#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildPublicUserIndex } from "../functions/public-user-index.js";

const PRIVATE_FIELD_NAMES = new Set([
  "password",
  "email",
  "phone",
  "nid",
  "nidUrl",
  "docImage",
  "userImage",
  "paymentNumber",
  "trxId",
  "secret",
  "token",
]);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    "Usage: node scripts/production-audit.mjs --mode <people-index|chat-membership> --input <local-export.json> [--sample-size N]",
  );
  process.exitCode = 2;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) return usage(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    if (key === "help") {
      usage();
      process.exit(0);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) return usage(`Missing value for --${key}`);
    args[key] = next;
    index += 1;
  }
  if (!args.mode || !args.input) return usage("--mode and --input are required");
  if (!["people-index", "chat-membership"].includes(args.mode)) {
    return usage(`Unsupported mode: ${args.mode}`);
  }
  return args;
}

function readLocalJson(filePath) {
  if (/^(https?:|gs:|s3:)/i.test(filePath)) {
    throw new Error("Only a local JSON export is accepted; network sources are forbidden.");
  }
  const absolutePath = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Input must be a JSON object export.");
  }
  return parsed;
}

function assertNoPrivateFields(value, location = "projection") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_FIELD_NAMES.has(key)) {
      throw new Error(`Private field ${location}.${key} would be exposed.`);
    }
    if (child && typeof child === "object") assertNoPrivateFields(child, `${location}.${key}`);
  }
}

function peopleIndexReport(exported, sampleSize) {
  const users = exported.users && typeof exported.users === "object" ? exported.users : exported;
  const projections = [];
  const deletes = [];
  const invalid = [];
  for (const [uid, profile] of Object.entries(users)) {
    const projection = buildPublicUserIndex(profile, uid);
    if (!projection) {
      deletes.push(uid);
      continue;
    }
    try {
      assertNoPrivateFields(projection, `people_index/${uid}`);
      projections.push({ uid, projection });
    } catch (error) {
      invalid.push({ uid, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    mode: "people-index",
    dryRun: true,
    source: "local JSON export",
    sourceUserCount: Object.keys(users).length,
    expectedProjectionWrites: projections.length,
    expectedProjectionDeletes: deletes.length,
    invalidProjectionCount: invalid.length,
    privateFieldsDetected: invalid.length > 0,
    sampleProjections: projections.slice(0, sampleSize),
    deletedUserSample: deletes.slice(0, sampleSize),
    invalidProjectionSample: invalid.slice(0, sampleSize),
    nextAction: "Review this report and obtain explicit approval before any Admin SDK backfill.",
  };
}

function canonicalParticipants(chatId) {
  const parts = String(chatId).split("_");
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) return null;
  return [...parts].sort();
}

function chatMembershipReport(exported, sampleSize) {
  const chats = exported.chats && typeof exported.chats === "object" ? exported.chats : {};
  const userChats = exported.user_chats && typeof exported.user_chats === "object" ? exported.user_chats : {};
  const blocks = exported.user_blocks && typeof exported.user_blocks === "object" ? exported.user_blocks : {};
  const existingMemberships = exported.chat_members && typeof exported.chat_members === "object" ? exported.chat_members : {};
  const valid = [];
  const invalid = [];
  const alreadyProvisioned = [];
  const membershipConflicts = [];
  for (const [chatId, messages] of Object.entries(chats)) {
    const participants = canonicalParticipants(chatId);
    const reasons = [];
    if (!participants) reasons.push("chat ID is not a canonical two-UID pair");
    const senders = new Set();
    if (messages && typeof messages === "object") {
      for (const message of Object.values(messages)) {
        if (message && typeof message.sender === "string") senders.add(message.sender);
      }
    }
    if (participants && [...senders].some((uid) => !participants.includes(uid))) {
      reasons.push("message sender is outside the canonical participant pair");
    }
    if (participants) {
      const [first, second] = participants;
      if (!userChats[first]?.[second] || !userChats[second]?.[first]) {
        reasons.push("reciprocal user_chats metadata is incomplete");
      }
      if (blocks[first]?.[second] || blocks[second]?.[first]) {
        reasons.push("participant pair is blocked");
      }
      const existing = existingMemberships[chatId] && typeof existingMemberships[chatId] === "object"
        ? existingMemberships[chatId]
        : {};
      const unexpectedMembers = Object.entries(existing)
        .filter(([uid, enabled]) => Boolean(enabled) && !participants.includes(uid))
        .map(([uid]) => uid);
      if (unexpectedMembers.length) {
        reasons.push("existing membership includes a non-participant");
        membershipConflicts.push({ chatId, unexpectedMembers });
      }
      if (!unexpectedMembers.length && participants.every((uid) => existing[uid] === true)) alreadyProvisioned.push(chatId);
    }
    const record = { chatId, participants, messageCount: Object.keys(messages || {}).length, reasons };
    (reasons.length ? invalid : valid).push(record);
  }
  return {
    mode: "chat-membership",
    dryRun: true,
    source: "local JSON export",
    sourceChatCount: Object.keys(chats).length,
    validChatCount: valid.length,
    invalidChatCount: invalid.length,
    alreadyProvisionedCount: alreadyProvisioned.length,
    membershipConflictCount: membershipConflicts.length,
    membershipConflictSample: membershipConflicts.slice(0, sampleSize),
    plannedMembershipWrites: valid.flatMap(({ chatId, participants }) => {
      const existing = existingMemberships[chatId] && typeof existingMemberships[chatId] === "object"
        ? existingMemberships[chatId]
        : {};
      return participants
        .filter((uid) => existing[uid] !== true)
        .map((uid) => ({ path: `chat_members/${chatId}/${uid}`, value: true }));
    }),
    validChatSample: valid.slice(0, sampleSize),
    invalidChatSample: invalid.slice(0, sampleSize),
    nextAction: "Create a backup and obtain explicit migration approval before provisioning memberships.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args) process.exit(2);
    const sampleSize = Math.max(1, Math.min(50, Number(args["sample-size"] || 5)));
    const exported = readLocalJson(args.input);
    const report = args.mode === "people-index"
      ? peopleIndexReport(exported, sampleSize)
      : chatMembershipReport(exported, sampleSize);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { chatMembershipReport, peopleIndexReport };
