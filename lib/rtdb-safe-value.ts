/** Removes top-level undefined fields, which Realtime Database rejects. */
export function omitUndefinedFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  );
}
