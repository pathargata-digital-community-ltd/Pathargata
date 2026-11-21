import { describe, expect, it } from "vitest";
import {
  MAX_POST_AUDIO_BYTES,
  assertPostVideoUploadsAllowed,
  getPostAudioFormat,
  resolvePostVideoType,
  validatePostAudioFileSize,
  validatePostVideoFileSize,
  validatePostVideoMetadata,
} from "../lib/post-media-policy";

describe("post media upload policy", () => {
  it("rejects every video type and filename because post video uploads are disabled", () => {
    expect(resolvePostVideoType({ mimeType: "video/mp4", fileName: "clip.mp4" })).toBeUndefined();
    expect(resolvePostVideoType({ mimeType: "video/quicktime", fileName: "clip.mov" })).toBeUndefined();
    expect(() => validatePostVideoMetadata({ mimeType: "video/mp4", fileName: "clip.mp4", duration: 1, width: 1, height: 1 })).toThrow("POST_VIDEO_DISABLED");
    expect(() => validatePostVideoFileSize(1024)).toThrow("POST_VIDEO_DISABLED");
  });

  it("blocks the legacy post-video upload folder but leaves post-audio enabled", () => {
    expect(() => assertPostVideoUploadsAllowed("post-video")).toThrow("POST_VIDEO_DISABLED");
    expect(() => assertPostVideoUploadsAllowed("post-audio")).not.toThrow();
  });

  it("uses platform-compatible audio file formats", () => {
    expect(getPostAudioFormat("android")).toEqual({ mimeType: "audio/mp4", extension: "m4a" });
    expect(getPostAudioFormat("ios")).toEqual({ mimeType: "audio/mp4", extension: "m4a" });
    expect(getPostAudioFormat("web")).toEqual({ mimeType: "audio/webm", extension: "webm" });
  });

  it("enforces non-empty audio file-size bounds", () => {
    expect(() => validatePostAudioFileSize(1024)).not.toThrow();
    expect(() => validatePostAudioFileSize(MAX_POST_AUDIO_BYTES)).toThrow("POST_AUDIO_SIZE_INVALID");
  });
});
