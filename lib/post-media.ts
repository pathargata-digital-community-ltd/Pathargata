export type ParsedPostEmbeds = {
  text: string;
  youtubeId?: string;
  youtubeIsShort: boolean;
  driveId?: string;
};

const YOUTUBE_URL_PATTERN =
  /(?:https?:\/\/)?(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const DRIVE_URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)(?:\/[^\s?#]*)?(?:\?[^\s#]*)?/i;
const VIDEO_URL_PATTERN = /\.(?:mp4|m4v|mov|webm)(?:[?#].*)?$/i;

export function normalizePostImages(
  images?: unknown,
  image?: unknown,
): string[] {
  const candidates = Array.isArray(images)
    ? images
    : images && typeof images === "object"
      ? Object.values(images as Record<string, unknown>)
      : typeof images === "string"
        ? [images]
        : image !== undefined && image !== null
          ? [image]
          : [];
  const values = candidates.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  if (values.length > 0 || image === undefined || image === null) {
    return values;
  }
  return typeof image === "string" && image.trim() ? [image] : [];
}

export function isSinglePostVideo(
  uri: string,
  mediaType?: string,
  imageCount = 1,
) {
  return (
    imageCount === 1 &&
    (mediaType?.toLowerCase() === "video" || VIDEO_URL_PATTERN.test(uri))
  );
}

export function parsePostMediaContent(content?: string): ParsedPostEmbeds {
  let text = content || "";
  const youtubeMatch = text.match(YOUTUBE_URL_PATTERN);
  const driveMatch = text.match(DRIVE_URL_PATTERN);

  if (youtubeMatch) text = text.replace(youtubeMatch[0], "");
  if (driveMatch) text = text.replace(driveMatch[0], "");

  return {
    text: text.replace(/[ \t]{2,}/g, " ").trim(),
    youtubeId: youtubeMatch?.[1],
    youtubeIsShort: Boolean(youtubeMatch?.[0].includes("shorts")),
    driveId: driveMatch?.[1],
  };
}
