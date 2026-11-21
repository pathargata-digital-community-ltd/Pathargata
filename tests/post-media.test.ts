import { describe, expect, it } from "vitest";
import {
  isSinglePostVideo,
  normalizePostImages,
  parsePostMediaContent,
} from "../lib/post-media";

describe("post media normalization", () => {
  it("accepts both Web array and keyed-object image schemas", () => {
    expect(normalizePostImages(["one.jpg", "two.png"])).toEqual([
      "one.jpg",
      "two.png",
    ]);
    expect(
      normalizePostImages({ second: "two.png", first: "one.jpg" }),
    ).toEqual(["two.png", "one.jpg"]);
  });

  it("uses the legacy single image when the images list is empty", () => {
    expect(normalizePostImages([], "legacy.jpg")).toEqual(["legacy.jpg"]);
    expect(normalizePostImages(undefined, " ")).toEqual([]);
  });

  it("detects one-item video posts and direct video file URLs", () => {
    expect(isSinglePostVideo("https://cdn.test/clip", "video", 1)).toBe(true);
    expect(
      isSinglePostVideo("https://cdn.test/clip.mp4?token=x", "image", 1),
    ).toBe(true);
    expect(isSinglePostVideo("https://cdn.test/clip.mp4", "video", 2)).toBe(
      false,
    );
  });
});

describe("post media link parsing", () => {
  it("extracts YouTube watch/short links and removes the embed URL from the text", () => {
    expect(
      parsePostMediaContent("দেখুন https://youtu.be/abcdefghijk এখনই"),
    ).toEqual({
      text: "দেখুন এখনই",
      youtubeId: "abcdefghijk",
      youtubeIsShort: false,
      driveId: undefined,
    });
    expect(
      parsePostMediaContent("https://youtube.com/shorts/abcdefghijk"),
    ).toMatchObject({ youtubeId: "abcdefghijk", youtubeIsShort: true });
    expect(parsePostMediaContent("https://m.youtube.com/watch?v=abcdefghijk")).toMatchObject({
      youtubeId: "abcdefghijk",
      youtubeIsShort: false,
    });
    expect(parsePostMediaContent("https://www.youtube.com/live/abcdefghijk")).toMatchObject({
      youtubeId: "abcdefghijk",
      youtubeIsShort: false,
    });
  });

  it("extracts Google Drive preview IDs and leaves unrelated text intact", () => {
    expect(
      parsePostMediaContent(
        "ফাইল: https://drive.google.com/file/d/abc123_X/view?usp=sharing",
      ),
    ).toEqual({
      text: "ফাইল:",
      youtubeId: undefined,
      youtubeIsShort: false,
      driveId: "abc123_X",
    });
    expect(parsePostMediaContent("শুধু লেখা").text).toBe("শুধু লেখা");
  });
});
