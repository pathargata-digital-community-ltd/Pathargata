#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildPublicPostProjection } from "./build-public-post-projection.mjs";

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readExport(inputPath) {
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  return {
    posts: input.posts ?? {},
    existingPublicPosts: input.public_posts ?? {},
  };
}

export function preparePublicPostBackfill(input, limit = 100000) {
  const posts = input.posts ?? {};
  const existingPublicPosts = input.existingPublicPosts ?? input.public_posts ?? {};
  const report = buildPublicPostProjection(posts, limit);
  const applyUpdates = {};
  const rollbackUpdates = {};

  for (const [postId, projectedPost] of Object.entries(report.publicPosts)) {
    applyUpdates[`public_posts/${postId}`] = projectedPost;
    rollbackUpdates[`public_posts/${postId}`] = existingPublicPosts[postId] ?? null;
  }

  return {
    dryRun: true,
    sourceSha256: sha256(posts),
    existingProjectionSha256: sha256(existingPublicPosts),
    sourcePostCount: report.sourcePostCount,
    expectedPublicProjectionCount: report.publicProjectionCount,
    excludedPrivateCount: report.excludedPrivateCount,
    projectionIds: Object.keys(report.publicPosts),
    applyUpdates,
    rollbackUpdates,
    rollbackNote: "Apply rollbackUpdates as a multi-location update; source posts are never modified by this plan.",
  };
}

function main() {
  const [inputPath, outputPath = "public-post-backfill.plan.json", limitArg] = process.argv.slice(2);
  if (!inputPath) {
    console.error("Usage: node scripts/prepare-public-post-backfill.mjs <posts-export.json> [plan.json] [limit]");
    process.exitCode = 1;
    return;
  }
  const exportData = readExport(inputPath);
  const plan = preparePublicPostBackfill(exportData, limitArg ?? 100000);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Backfill plan ready: ${plan.expectedPublicProjectionCount} public projections from ${plan.sourcePostCount} posts.`);
  console.log(`Excluded private posts: ${plan.excludedPrivateCount}.`);
  console.log(`No Firebase data was read or written. Plan: ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
