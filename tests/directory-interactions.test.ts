import { describe, expect, it } from "vitest";
import {
  buildDirectoryReviewPayload,
  collectBookmarkedDirectoryEntries,
} from "../lib/directory-interactions";

describe("collectBookmarkedDirectoryEntries", () => {
  it("collects saved IDs across categories and uses each Firebase key as the item ID", () => {
    const entries = collectBookmarkedDirectoryEntries(
      {
        doctor: {
          doctor1: { name: "ডাক্তার", id: "stale-id" },
          doctor2: { name: "অন্য ডাক্তার" },
        },
        police: { station1: { name: "থানা" } },
      },
      ["doctor", "police", "unknown"],
      ["doctor1", "station1", "not-found"],
    );

    expect(entries).toEqual([
      {
        id: "doctor1",
        categoryId: "doctor",
        item: { name: "ডাক্তার", id: "doctor1" },
      },
      {
        id: "station1",
        categoryId: "police",
        item: { name: "থানা", id: "station1" },
      },
    ]);
  });

  it("returns an empty list when there are no saved IDs or no matching data", () => {
    expect(collectBookmarkedDirectoryEntries({}, ["doctor"], [])).toEqual([]);
    expect(
      collectBookmarkedDirectoryEntries(
        { doctor: { a: null } },
        ["doctor"],
        ["a"],
      ),
    ).toEqual([]);
  });
});

describe("buildDirectoryReviewPayload", () => {
  it("matches the Web review fields, trims text, and keeps the timestamp", () => {
    expect(
      buildDirectoryReviewPayload(
        { rating: 4, comment: "  ভালো সেবা  ", userName: "  মিতা  " },
        1700000000,
      ),
    ).toEqual({
      rating: 4,
      comment: "ভালো সেবা",
      userName: "মিতা",
      timestamp: 1700000000,
    });
  });

  it("allows an empty comment and falls back to the anonymous user label", () => {
    expect(buildDirectoryReviewPayload({ rating: "5" }, 1700000001)).toEqual({
      rating: 5,
      comment: "",
      userName: "অজ্ঞাত ব্যবহারকারী",
      timestamp: 1700000001,
    });
  });

  it.each([0, 6, 1.5, "bad"])("rejects invalid rating %s", (rating) => {
    expect(() => buildDirectoryReviewPayload({ rating }, 1700000002)).toThrow(
      "দয়া করে ১ থেকে ৫ স্টারের মধ্যে রেটিং দিন।",
    );
  });
});
