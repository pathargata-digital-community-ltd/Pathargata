#!/usr/bin/env node

import fs from "node:fs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compactImages(value) {
  const values = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  return values.filter((image) => typeof image === "string" && image.length > 0).slice(0, 8);
}

function compactCommentPreviews(value) {
  if (!isRecord(value)) return [];
  return Object.entries(value).slice(-2).map(([id, raw]) => {
    const comment = isRecord(raw) ? raw : {};
    return {
      id,
      author: typeof comment.author === "string" ? comment.author : "একজন ব্যবহারকারী",
      authorUid: typeof comment.authorUid === "string" ? comment.authorUid : undefined,
      authorPic: typeof comment.authorPic === "string" || comment.authorPic === null ? comment.authorPic : undefined,
      text: typeof comment.text === "string" ? comment.text : "",
    };
  }).filter((comment) => comment.text.trim().length > 0);
}

function buildFeedProjection(post) {
  const projection = {};
  const fields = [
    "uid", "author", "authorPic", "authorVerified", "title", "text", "description", "content",
    "mediaType", "type", "repostMessage", "originalPostId", "originalPostAuthorUid", "originalPostAuthor",
    "originalPostAuthorPic", "originalPostTitle", "originalPostBody", "originalPostAudio", "originalPostType",
    "originalPostMediaType", "originalPostFeeling", "originalPostCheckInLocation", "audio", "feeling",
    "checkInLocation", "bgColor", "mobile", "socialLink", "union", "village", "authorRole", "adminScore",
    "expiresAt", "repostCount", "timestamp",
  ];
  for (const field of fields) if (post[field] !== undefined && post[field] !== null) projection[field] = post[field];
  projection.images = compactImages(post.images ?? (post.image ? [post.image] : []));
  projection.originalPostImages = compactImages(post.originalPostImages);
  projection.options = Array.isArray(post.options) ? post.options.filter(isRecord).map((option) => ({
    text: typeof option.text === "string" ? option.text : "",
    votes: Number(option.votes) || 0,
  })).filter((option) => option.text.length > 0) : [];
  projection.likeCount = isRecord(post.likes) ? Object.keys(post.likes).length : Number(post.likeCount) || 0;
  projection.commentCount = isRecord(post.comments) ? Object.keys(post.comments).length : Number(post.commentCount) || 0;
  projection.commentPreviews = post.commentPreviews ?? compactCommentPreviews(post.comments);
  projection.privacy = "public";
  return projection;
}

export function buildPublicPostProjection(postsValue, limit = 1000) {
  const posts = isRecord(postsValue) ? postsValue : {};
  const entries = Object.entries(posts)
    .filter(([, post]) => isRecord(post))
    .filter(([, post]) => {
      const privacy = String(post.privacy || "public").toLocaleLowerCase();
      return privacy === "public" || privacy === "everyone";
    })
    .sort(([, a], [, b]) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, Math.max(0, Number(limit) || 0));

  const publicPosts = {};
  for (const [id, post] of entries) {
    publicPosts[id] = buildFeedProjection(post);
  }

  return {
    dryRun: true,
    sourcePostCount: Object.keys(posts).length,
    publicProjectionCount: entries.length,
    excludedPrivateCount: Object.entries(posts).filter(([, post]) => {
      if (!isRecord(post)) return false;
      const privacy = String(post.privacy || "public").toLocaleLowerCase();
      return privacy !== "public" && privacy !== "everyone";
    }).length,
    publicPosts,
  };
}

function main() {
  const [inputPath, outputPath = "public-post-projection.dry-run.json", limitArg] = process.argv.slice(2);
  if (!inputPath) {
    console.error("Usage: node scripts/build-public-post-projection.mjs <posts-export.json> [output.json] [limit]");
    process.exitCode = 1;
    return;
  }
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const posts = input.posts ?? input;
  const report = buildPublicPostProjection(posts, limitArg ?? 1000);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Dry-run complete: ${report.publicProjectionCount} public projections from ${report.sourcePostCount} posts.`);
  console.log(`No Firebase data was read or written. Output: ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
