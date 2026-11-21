import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLegacySavedLogins } from "../lib/legacy-saved-login-cleanup";

const { secureStore, platform } = vi.hoisted(() => ({
  secureStore: {
    getItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
  platform: { OS: "android" },
}));

vi.mock("expo-secure-store", () => secureStore);
vi.mock("react-native", () => ({ Platform: platform }));

const LEGACY_INDEX_KEY = "pathargata_saved_accounts_v1";

beforeEach(() => {
  vi.clearAllMocks();
  platform.OS = "android";
  secureStore.getItemAsync.mockResolvedValue(null);
  secureStore.deleteItemAsync.mockResolvedValue(undefined);
});

describe("legacy saved-password cleanup", () => {
  it("deletes each indexed credential and then the old account index", async () => {
    secureStore.getItemAsync.mockResolvedValue(
      JSON.stringify([
        { uid: "member-a" },
        { uid: "member-b" },
        { uid: "member-a" },
        { uid: 42 },
        {},
      ]),
    );

    await clearLegacySavedLogins();

    expect(secureStore.deleteItemAsync.mock.calls).toEqual([
      ["pathargata_saved_login_v1_member-a"],
      ["pathargata_saved_login_v1_member-b"],
      [LEGACY_INDEX_KEY],
    ]);
  });

  it("removes a malformed account index without guessing credential keys", async () => {
    secureStore.getItemAsync.mockResolvedValue("not-json");

    await clearLegacySavedLogins();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(LEGACY_INDEX_KEY);
  });

  it("keeps the index if a credential deletion fails so the next startup can retry", async () => {
    secureStore.getItemAsync.mockResolvedValue(
      JSON.stringify([{ uid: "member-a" }]),
    );
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error("delete failed"));

    await expect(clearLegacySavedLogins()).rejects.toThrow("delete failed");
    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      "pathargata_saved_login_v1_member-a",
    );
  });

  it("does not access native storage on web", async () => {
    platform.OS = "web";

    await clearLegacySavedLogins();

    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
