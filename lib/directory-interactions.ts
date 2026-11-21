export type SavedDirectoryEntry = {
  id: string;
  categoryId: string;
  item: Record<string, unknown> & { id: string };
};

export type DirectoryReviewPayload = {
  rating: number;
  comment: string;
  userName: string;
  timestamp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function collectBookmarkedDirectoryEntries(
  directoryValue: unknown,
  categoryIds: readonly string[],
  bookmarkIds: readonly string[],
): SavedDirectoryEntry[] {
  if (bookmarkIds.length === 0) return [];
  const directory = asRecord(directoryValue);
  const bookmarks = new Set(bookmarkIds);

  return categoryIds.flatMap((categoryId) => {
    const categoryValue = asRecord(directory[categoryId]);
    return Object.entries(categoryValue)
      .filter(([id, value]) => bookmarks.has(id) && isRecord(value))
      .map(([id, value]) => ({
        id,
        categoryId,
        item: { ...asRecord(value), id },
      }));
  });
}

export function buildDirectoryReviewPayload(
  input: { rating: unknown; comment?: unknown; userName?: unknown },
  timestamp = Date.now(),
): DirectoryReviewPayload {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("দয়া করে ১ থেকে ৫ স্টারের মধ্যে রেটিং দিন।");
  }

  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  const userName =
    typeof input.userName === "string" && input.userName.trim()
      ? input.userName.trim()
      : "অজ্ঞাত ব্যবহারকারী";
  const submittedAt =
    Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();

  return { rating, comment, userName, timestamp: submittedAt };
}
