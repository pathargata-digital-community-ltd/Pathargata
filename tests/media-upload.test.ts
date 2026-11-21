import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadCloudinaryBlob, uploadImageFromUri } from "../lib/media-upload";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-file-system/legacy", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Cloudinary image upload", () => {
  it("sends a web File/Blob as multipart data and returns its secure URL", async () => {
    const photo = new Blob(["photo-bytes"], { type: "image/jpeg" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          secure_url:
            "https://res.cloudinary.com/pathargata/image/upload/photo.jpg",
          resource_type: "image",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadImageFromUri("blob:photo", "image/jpeg", photo);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("/auto/upload");
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = request.body as FormData;
    const uploadedFile = body.get("file");
    expect(uploadedFile).toBeInstanceOf(Blob);
    expect((uploadedFile as Blob).type).toBe("image/jpeg");
    expect(body.get("upload_preset")).toBe("Pathargata digital");
    expect(result).toEqual({
      url: "https://res.cloudinary.com/pathargata/image/upload/photo.jpg",
      type: "image",
      resourceType: "image",
    });
  });

  it("shows the provider's upload error instead of hiding it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "Upload preset is not configured" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadImageFromUri("blob:photo", "image/jpeg", new Blob(["photo"])),
    ).rejects.toThrow("Upload preset is not configured");
  });

  it("rejects video uploads before making any Cloudinary request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadCloudinaryBlob(new Blob(["clip"], { type: "video/mp4" }), "video/mp4", "clip.mp4"))
      .rejects.toThrow("VIDEO_UPLOAD_DISABLED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports bounded byte-transfer progress when requested", async () => {
    class ProgressRequest {
      upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
      status = 200;
      responseText = JSON.stringify({ secure_url: "https://res.cloudinary.com/example/video/upload/audio.m4a", resource_type: "video" });
      open = vi.fn();
      send = vi.fn(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
        this.onload?.();
      });
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;
      timeout = 0;
      getResponseHeader() { return "application/json"; }
    }
    vi.stubGlobal("XMLHttpRequest", ProgressRequest);
    const progress: number[] = [];

    await uploadCloudinaryBlob(new Blob(["audio-bytes"], { type: "audio/mp4" }), "audio/mp4", "audio.m4a", "ভয়েস", (value) => progress.push(value));

    expect(progress).toEqual([50]);
  });
});
