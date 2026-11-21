type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compactImages(value: unknown): string[] {
  const values = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  return values
    .filter((image): image is string => typeof image === "string" && image.length > 0)
    .slice(0, 8);
}

function compactCommentPreviews(value: unknown) {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .slice(-2)
    .map(([id, raw]) => {
      const comment = isRecord(raw) ? raw : {};
      return {
        id,
        author: stringValue(comment.author) || "একজন ব্যবহারকারী",
        authorUid: stringValue(comment.authorUid),
        authorPic: typeof comment.authorPic === "string" || comment.authorPic === null ? comment.authorPic : undefined,
        text: stringValue(comment.text) || "",
      };
    })
    .filter((comment) => comment.text.trim().length > 0);
}

export function buildPublicFeedPostProjection(value: RecordValue): RecordValue {
  const projection: RecordValue = {};
  const feedFields = [
    "uid", "author", "authorPic", "authorVerified", "title", "text", "description", "content",
    "mediaType", "type", "repostMessage", "originalPostId", "originalPostAuthorUid", "originalPostAuthor",
    "originalPostAuthorPic", "originalPostTitle", "originalPostBody", "originalPostAudio", "originalPostType",
    "originalPostMediaType", "originalPostFeeling", "originalPostCheckInLocation", "audio", "feeling",
    "checkInLocation", "bgColor", "mobile", "socialLink", "union", "village", "privacy", "authorRole",
    "adminScore", "expiresAt", "repostCount", "timestamp", "youtubeUrl", "youtubeTitle",
  ];
  for (const field of feedFields) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && fieldValue !== null) projection[field] = fieldValue;
  }

  projection.images = compactImages(value.images ?? (value.image ? [value.image] : []));
  projection.originalPostImages = compactImages(value.originalPostImages);
  projection.options = Array.isArray(value.options)
    ? value.options
        .filter(isRecord)
        .map((option) => ({ text: stringValue(option.text) || "", votes: Number(option.votes) || 0 }))
        .filter((option) => option.text.length > 0)
    : [];
  projection.likeCount = isRecord(value.likes) ? Object.keys(value.likes).length : Number(value.likeCount) || 0;
  projection.commentCount = isRecord(value.comments) ? Object.keys(value.comments).length : Number(value.commentCount) || 0;
  projection.commentPreviews = value.commentPreviews ?? compactCommentPreviews(value.comments);
  projection.privacy = "public";
  return projection;
}
