import { describe, expect, it } from "vitest";
import { applyFeedInteraction, extractFeedTopics } from "../lib/feed-preferences";

const day = 86_400_000;

describe("feed preference signals", () => {
  it("keeps meaningful Bengali and English topics while ignoring common filler words", () => {
    expect(extractFeedTopics({ title: "আমার গ্রামের শিক্ষা সংবাদ", body: "Scholarship and school updates" })).toEqual(["গ্রামের", "শিক্ষা", "সংবাদ", "scholarship", "school", "updates"]);
  });

  it("weights saves above opens and records only aggregate preferences, not raw post history", () => {
    const post = { uid: "author-1", title: "Local school scholarship", body: "Education support", type: "education" };
    const open = applyFeedInteraction(null, post, "open", day);
    const saved = applyFeedInteraction(open, post, "save", day + 1);
    expect(saved.topics.education).toBeGreaterThan(open.topics.education);
    expect(saved.authors["author-1"]).toBeGreaterThan(open.authors["author-1"]);
    expect(saved.types.education).toBeGreaterThan(open.types.education);
    expect(JSON.stringify(saved)).not.toContain("school scholarship");
    expect(saved).not.toHaveProperty("postIds");
  });

  it("learns the original topic and type when a user engages with a repost", () => {
    const repost = { type: "repost", originalPostType: "education", originalPostTitle: "Education scholarship" };
    const saved = applyFeedInteraction(null, repost, "save", day);
    expect(saved.topics.education).toBeGreaterThan(0);
    expect(saved.topics.scholarship).toBeGreaterThan(0);
    expect(saved.types.education).toBeGreaterThan(0);
    expect(saved.types.repost).toBeUndefined();
  });

  it("uses negative hide feedback and decays stale interests over time", () => {
    const post = { uid: "author-1", title: "Market vegetables", type: "market" };
    const positive = applyFeedInteraction(null, post, "save", day);
    const repeatedPositive = applyFeedInteraction(positive, post, "save", day + 1);
    const hidden = applyFeedInteraction(positive, post, "hide", day + 1);
    expect(hidden.topics.market ?? 0).toBeLessThan(repeatedPositive.topics.market);
    const aged = applyFeedInteraction(positive, { title: "New post" }, "open", day + 46 * day);
    expect(aged.topics.market).toBeCloseTo(positive.topics.market * 0.5, 1);
  });
});
