import { afterEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentifier, safeErrorCode } from "../lib/safe-logger";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("safe auth logging", () => {
  it("uses a stable anonymous identifier without exposing the source value", () => {
    const uid = "firebase-user-123";
    const identifier = anonymousIdentifier(uid);

    expect(identifier).toMatch(/^anon_[a-z0-9]+$/);
    expect(identifier).not.toContain(uid);
    expect(anonymousIdentifier(uid)).toBe(identifier);
    expect(anonymousIdentifier("different-user")).not.toBe(identifier);
  });

  it("keeps only a bounded error code for structured events", () => {
    expect(safeErrorCode({ code: "auth/invalid-credential", message: "secret" })).toBe(
      "auth/invalid-credential",
    );
    expect(safeErrorCode(new Error("raw token must never be logged"))).toBe(
      "operation_failed",
    );
  });

  it("does not emit raw error messages in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { authFailure } = await import("../lib/safe-logger");

    authFailure("session_validation_failed", new Error("raw-token-value"), {
      actor: "anon_example",
    });

    expect(warning).toHaveBeenCalledTimes(1);
    const event = String(warning.mock.calls[0]?.[0]);
    expect(event).toContain("session_validation_failed");
    expect(event).toContain("operation_failed");
    expect(event).not.toContain("raw-token-value");
  });
});
