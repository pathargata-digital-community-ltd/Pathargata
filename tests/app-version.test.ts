import { describe, expect, it } from "vitest";
import {
  compareAppVersions,
  normalizeAppVersion,
  safeHttpsUrl,
} from "../lib/app-version";

describe("Native app version helpers", () => {
  it("normalizes and compares dotted numeric versions", () => {
    expect(normalizeAppVersion("v1.0.4")).toBe("1.0.4");
    expect(compareAppVersions("1.0.5", "1.0.4")).toBe(1);
    expect(compareAppVersions("1.0", "1.0.0")).toBe(0);
    expect(compareAppVersions("1.0.3", "1.0.4")).toBe(-1);
  });

  it("returns null for unsupported version values", () => {
    expect(normalizeAppVersion("latest")).toBeNull();
    expect(compareAppVersions("1.0.4-beta", "1.0.4")).toBeNull();
  });

  it("accepts only HTTPS external update links", () => {
    expect(safeHttpsUrl("https://example.com/app")).toBe(
      "https://example.com/app",
    );
    expect(safeHttpsUrl("http://example.com/app")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
  });
});
