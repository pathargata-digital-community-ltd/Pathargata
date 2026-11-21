export const MAX_POST_AUDIO_DURATION_SECONDS = 60;
export const MAX_POST_AUDIO_BYTES = 10 * 1024 * 1024;

export type PostVideoMetadata = {
  mimeType?: string | null;
  fileName?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
};

export function assertPostVideoUploadsAllowed(folder: string): void {
  if (folder === "post-video") throw new Error("POST_VIDEO_DISABLED");
}

/** Video publishing is disabled for posts on every platform. */
export function resolvePostVideoType(_metadata: Pick<PostVideoMetadata, "mimeType" | "fileName">) {
  return undefined;
}

export function getPostAudioFormat(platform: "web" | "ios" | "android" | "other") {
  return platform === "web"
    ? { mimeType: "audio/webm", extension: "webm" }
    : { mimeType: "audio/mp4", extension: "m4a" };
}

export function validatePostVideoMetadata(_metadata: PostVideoMetadata): never {
  throw new Error("POST_VIDEO_DISABLED");
}

export function validatePostAudioFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0 || size >= MAX_POST_AUDIO_BYTES) {
    throw new Error("POST_AUDIO_SIZE_INVALID");
  }
}

export function validatePostVideoFileSize(_size: number): never {
  throw new Error("POST_VIDEO_DISABLED");
}
