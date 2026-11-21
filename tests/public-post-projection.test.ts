import { describe, expect, it } from "vitest";
import { buildPublicPostProjection } from "../scripts/build-public-post-projection.mjs";
import { buildPublicFeedPostProjection } from "../lib/public-post-projection";

describe("public post projection dry-run", () => {
  it("preserves the supported voice and single-video post schema without draft fields", () => {
    const projection = buildPublicFeedPostProjection({
      uid: "author-1",
      privacy: "public",
      timestamp: 123,
      type: "video",
      mediaType: "video",
      images: ["https://res.cloudinary.com/example/video/upload/clip.mp4"],
      audio: "https://res.cloudinary.com/example/video/upload/voice.m4a",
      draftLocalUri: "file:///private/device/path",
      exif: { GPSLatitude: 1 },
    });

    expect(projection).toMatchObject({
      uid: "author-1",
      privacy: "public",
      type: "video",
      mediaType: "video",
      images: ["https://res.cloudinary.com/example/video/upload/clip.mp4"],
      audio: "https://res.cloudinary.com/example/video/upload/voice.m4a",
    });
    expect(projection.draftLocalUri).toBeUndefined();
    expect(projection.exif).toBeUndefined();

    const dryRun = buildPublicPostProjection({
      video: {
        uid: "author-1",
        privacy: "public",
        timestamp: 123,
        type: "video",
        mediaType: "video",
        images: ["https://res.cloudinary.com/example/video/upload/clip.mp4"],
        audio: "https://res.cloudinary.com/example/video/upload/voice.m4a",
      },
    }, 10);
    expect((dryRun.publicPosts as Record<string, Record<string, unknown>>).video).toMatchObject({
      type: "video",
      mediaType: "video",
      images: ["https://res.cloudinary.com/example/video/upload/clip.mp4"],
      audio: "https://res.cloudinary.com/example/video/upload/voice.m4a",
    });
  });

  it("projects only public posts and never mutates the source shape", () => {
    const source = {
      publicPost: { uid: "user-a", privacy: "public", timestamp: 3 },
      everyonePost: { uid: "user-a", privacy: "everyone", timestamp: 2 },
      friendsPost: { uid: "user-a", privacy: "friends", timestamp: 4 },
      privatePost: { uid: "user-a", privacy: "only_me", timestamp: 5 },
    };

    const report = buildPublicPostProjection(source, 10);

    expect(report.dryRun).toBe(true);
    expect(report.sourcePostCount).toBe(4);
    expect(report.publicProjectionCount).toBe(2);
    expect(report.excludedPrivateCount).toBe(2);
    expect(Object.keys(report.publicPosts)).toEqual(["publicPost", "everyonePost"]);
    expect((report.publicPosts as Record<string, unknown>).privatePost).toBeUndefined();
    expect(source.privatePost.privacy).toBe("only_me");
  });

  it("bounds the generated projection deterministically", () => {
    const report = buildPublicPostProjection({
      first: { privacy: "public", timestamp: 1 },
      second: { privacy: "public", timestamp: 2 },
      third: { privacy: "public", timestamp: 3 },
    }, 2);

    expect(Object.keys(report.publicPosts)).toEqual(["third", "second"]);
  });
});
