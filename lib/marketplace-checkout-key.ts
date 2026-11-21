/**
 * Build a bounded Firebase-callable idempotency key. React's useId can be only
 * a few characters after sanitizing, while the server requires at least 8.
 */
export function createMarketplaceCheckoutIdempotencyKey(
  instanceId: string,
  sequence: number,
  now = Date.now(),
): string {
  const safeInstanceId = instanceId.replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 48) || "native";
  const safeSequence = Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1;
  const safeTimestamp = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
  return `checkout-${safeTimestamp.toString(36)}-${safeSequence.toString(36)}-${safeInstanceId}`;
}
