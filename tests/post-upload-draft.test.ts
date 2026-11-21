import { describe, expect, it } from "vitest";
import { decodePostUploadDraft, encodePostUploadDraft, postUploadDraftStorageKey, type PostUploadDraft } from "../lib/post-upload-draft";

const draft: PostUploadDraft = {
  uid: "user-1", savedAt: 123, text: "hello", privacy: "public", themeId: "plain", media: [{ uri: "file://image.jpg" }, { uri: "file://image2.jpg" }],
  pollMode: false, pollOptions: [], feeling: null, location: "", taggedFriends: [], ephemeral: false, mobile: "", socialLink: "", recordingUri: "", recordingSeconds: 0, postKey: "post-1", uploadedMediaUrls: { "file://image.jpg": "https://cdn.test/image.jpg" },
};

describe("post upload retry drafts", () => {
  it("uses an encoded user-specific storage key", () => {
    expect(postUploadDraftStorageKey("user/a")).not.toBe(postUploadDraftStorageKey("user b"));
    expect(postUploadDraftStorageKey("user/a")).toContain("user%2Fa");
  });

  it("round-trips draft content and uploaded URLs for retry", () => {
    expect(decodePostUploadDraft(encodePostUploadDraft(draft), "user-1")).toEqual(draft);
  });

  it("never restores another user's draft", () => {
    expect(decodePostUploadDraft(encodePostUploadDraft(draft), "user-2")).toBeNull();
  });

  it("ignores empty, malformed, and structurally incomplete values", () => {
    expect(decodePostUploadDraft(null, "user-1")).toBeNull();
    expect(decodePostUploadDraft("{bad json", "user-1")).toBeNull();
    expect(decodePostUploadDraft(JSON.stringify({ uid: "user-1", savedAt: 1, text: "draft" }), "user-1")).toBeNull();
  });
});
