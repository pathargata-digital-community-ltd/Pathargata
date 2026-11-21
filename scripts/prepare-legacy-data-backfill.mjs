#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildPublicUserIndex } from "../functions/public-user-index.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function privacyOf(post) {
  return String(post?.privacy || "public").toLocaleLowerCase();
}

function numericTimestamp(post) {
  const timestamp = Number(post?.timestamp || 0);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function addUpdate(updates, pathName, value) {
  if (!pathName || pathName.includes("..")) return;
  updates[pathName] = value;
}

export function prepareLegacyDataBackfill(input, limit = 100000) {
  const users = isRecord(input.users) ? input.users : {};
  const posts = isRecord(input.posts) ? input.posts : {};
  const existing = {
    people_index: isRecord(input.people_index) ? input.people_index : {},
    public_posts: isRecord(input.public_posts) ? input.public_posts : {},
    user_post_index: isRecord(input.user_post_index) ? input.user_post_index : {},
    friends_post_index: isRecord(input.friends_post_index) ? input.friends_post_index : {},
  };
  const maxItems = Math.max(0, Number(limit) || 0);
  const applyUpdates = {};
  const rollbackUpdates = {};
  const skipped = [];
  let publicPostCount = 0;
  let ownIndexCount = 0;
  let friendsIndexCount = 0;

  for (const [uid, profile] of Object.entries(users)) {
    const projection = buildPublicUserIndex(profile, uid);
    if (!projection) {
      addUpdate(applyUpdates, `people_index/${uid}`, null);
      addUpdate(rollbackUpdates, `people_index/${uid}`, existing.people_index[uid] ?? null);
      continue;
    }
    addUpdate(applyUpdates, `people_index/${uid}`, projection);
    addUpdate(rollbackUpdates, `people_index/${uid}`, existing.people_index[uid] ?? null);
  }

  const orderedPosts = Object.entries(posts)
    .filter(([postId, post]) => {
      if (!isRecord(post) || typeof post.uid !== "string" || !post.uid || !isRecord(users[post.uid])) {
        skipped.push({ postId, reason: "missing-valid-owner" });
        return false;
      }
      return true;
    })
    .sort(([, a], [, b]) => numericTimestamp(b) - numericTimestamp(a))
    .slice(0, maxItems);

  for (const [postId, post] of orderedPosts) {
    const uid = post.uid;
    const hasExplicitPrivacy = typeof post.privacy === "string" && post.privacy.trim().length > 0;
    const privacy = privacyOf(post);
    addUpdate(applyUpdates, `user_post_index/${uid}/${postId}`, { timestamp: numericTimestamp(post) });
    addUpdate(rollbackUpdates, `user_post_index/${uid}/${postId}`, existing.user_post_index?.[uid]?.[postId] ?? null);
    ownIndexCount += 1;

    if (hasExplicitPrivacy && (privacy === "public" || privacy === "everyone")) {
      addUpdate(applyUpdates, `public_posts/${postId}`, { ...post, privacy: "public" });
      addUpdate(rollbackUpdates, `public_posts/${postId}`, existing.public_posts[postId] ?? null);
      publicPostCount += 1;
    } else if (hasExplicitPrivacy && (privacy === "friends" || privacy === "friends_only" || privacy === "friends-only")) {
      addUpdate(applyUpdates, `friends_post_index/${uid}/${postId}`, { timestamp: numericTimestamp(post) });
      addUpdate(rollbackUpdates, `friends_post_index/${uid}/${postId}`, existing.friends_post_index?.[uid]?.[postId] ?? null);
      friendsIndexCount += 1;
    }
  }

  for (const [postId, post] of Object.entries(posts)) {
    if (!isRecord(post) || typeof post.uid !== "string" || !post.uid) skipped.push({ postId, reason: "missing-owner-uid" });
    else if (!isRecord(users[post.uid])) skipped.push({ postId, reason: "missing-valid-owner" });
    else if (!orderedPosts.some(([id]) => id === postId)) skipped.push({ postId, reason: "outside-limit" });
  }

  return {
    dryRun: true,
    sourceSha256: sha256({ users, posts }),
    sourceUserCount: Object.keys(users).length,
    sourcePostCount: Object.keys(posts).length,
    peopleProjectionCount: Object.keys(users).filter((uid) => buildPublicUserIndex(users[uid], uid)).length,
    deletedUserProjectionCount: Object.keys(users).filter((uid) => !buildPublicUserIndex(users[uid], uid)).length,
    publicPostCount,
    ownIndexCount,
    friendsIndexCount,
    skippedCount: skipped.length,
    skippedSample: skipped.slice(0, 50),
    applyUpdates,
    rollbackUpdates,
    safety: {
      privateUserFieldsExcludedByProjection: true,
      nonPublicPostsExcludedFromPublicPosts: true,
      postsWithoutValidOwnersExcluded: true,
      sourcePostsNeverModified: true,
      defaultModeIsDryRun: true,
    },
    nextAction: "Review counts and backup export; only then apply the exact applyUpdates object with Admin SDK.",
  };
}

function readJson(filePath) {
  const absolute = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function main() {
  const [inputPath, outputPath = "legacy-data-backfill.plan.json", limitArg] = process.argv.slice(2);
  if (!inputPath) {
    console.error("Usage: node scripts/prepare-legacy-data-backfill.mjs <rtdb-export.json> [plan.json] [limit]");
    process.exitCode = 1;
    return;
  }
  const plan = prepareLegacyDataBackfill(readJson(inputPath), limitArg ?? 100000);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Dry-run complete: ${plan.peopleProjectionCount} user projections, ${plan.publicPostCount} public posts, ${plan.ownIndexCount} own indexes, ${plan.friendsIndexCount} friends indexes.`);
  console.log(`Skipped records: ${plan.skippedCount}. No Firebase data was read or written. Plan: ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
