import { describe, expect, it } from "vitest";
import { getFeedImageUri } from "../lib/media-delivery";

describe("feed media delivery", () => {
  it("adds a bounded Cloudinary thumbnail transformation", () => {
    expect(
      getFeedImageUri(
        "https://res.cloudinary.com/demo/image/upload/v123/pathargata/post.jpg",
      ),
    ).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_720,c_limit/v123/pathargata/post.jpg",
    );
  });

  it("leaves non-Cloudinary and non-image URLs unchanged", () => {
    const external = "https://cdn.example.test/post.jpg";
    const video = "https://res.cloudinary.com/demo/video/upload/v1/post.mp4";
    expect(getFeedImageUri(external)).toBe(external);
    expect(getFeedImageUri(video)).toBe(video);
  });
});
