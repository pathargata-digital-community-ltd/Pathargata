type SafeDetails = Record<string, string | number | boolean | null | undefined>;

type SafeError = unknown;

const isDevelopment =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process.env.NODE_ENV !== "production";

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function anonymousIdentifier(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return `anon_${hashText(value)}`;
}

export function safeErrorCode(error: SafeError): string {
  if (!error || typeof error !== "object") return "unknown_error";
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && /^[a-z0-9._/-]{2,64}$/i.test(code)) {
    return code;
  }
  return "operation_failed";
}

export function authDebug(event: string, details?: SafeDetails): void {
  if (!isDevelopment) return;
  console.debug(`[auth] ${event}`, details ?? {});
}

export function authFailure(
  event: string,
  error?: SafeError,
  details?: SafeDetails,
): void {
  const payload = {
    scope: "auth",
    event,
    code: safeErrorCode(error),
    ...(details ?? {}),
  };

  if (isDevelopment) {
    const message = error instanceof Error ? error.message : undefined;
    console.error(`[auth] ${event}`, message ?? payload.code, details ?? {});
    return;
  }

  // Production events contain only allow-listed metadata and never raw tokens,
  // email addresses, user IDs, URLs, or provider error messages.
  console.warn(JSON.stringify(payload));
}

export function networkDebug(event: string, details?: SafeDetails): void {
  if (!isDevelopment) return;
  console.debug(`[network] ${event}`, details ?? {});
}

export function networkFailure(
  event: string,
  error?: SafeError,
  details?: SafeDetails,
): void {
  const payload = {
    scope: "network",
    event,
    code: safeErrorCode(error),
    ...(details ?? {}),
  };

  if (isDevelopment) {
    const message = error instanceof Error ? error.message : undefined;
    console.error(`[network] ${event}`, message ?? payload.code, details ?? {});
    return;
  }

  console.warn(JSON.stringify(payload));
}
