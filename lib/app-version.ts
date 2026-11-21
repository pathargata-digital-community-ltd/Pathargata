export function normalizeAppVersion(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().replace(/^v/i, "");
  return /^\d+(\.\d+){1,2}$/.test(normalized) ? normalized : null;
}

export function compareAppVersions(
  leftValue: unknown,
  rightValue: unknown,
): -1 | 0 | 1 | null {
  const left = normalizeAppVersion(leftValue);
  const right = normalizeAppVersion(rightValue);
  if (!left || !right) return null;

  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const partCount = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
