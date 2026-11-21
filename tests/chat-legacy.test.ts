import CryptoJS from "crypto-js";
import { describe, expect, it } from "vitest";
import {
  decodeLegacyChatPreview,
  decodeLegacyChatText,
} from "../lib/chat-legacy";

const LEGACY_CHAT_SECRET = "PatharghataDigitalSecretKey";

describe("legacy Web chat preview compatibility", () => {
  it("decrypts the Web App's AES message body on the device", () => {
    const ciphertext = CryptoJS.AES.encrypt(
      "আজ কেমন আছেন?",
      LEGACY_CHAT_SECRET,
    ).toString();

    expect(decodeLegacyChatText(ciphertext)).toBe("আজ কেমন আছেন?");
  });

  it("decodes own-message previews and translates the sender label", () => {
    const ciphertext = CryptoJS.AES.encrypt(
      "আমি পৌঁছে গেছি",
      LEGACY_CHAT_SECRET,
    ).toString();

    expect(decodeLegacyChatPreview(`You: ${ciphertext}`)).toBe(
      "আপনি: আমি পৌঁছে গেছি",
    );
  });

  it("replaces unsupported encrypted tokens with a safe Bengali label", () => {
    expect(decodeLegacyChatPreview("U2FsdGVkX1invalid-encrypted-payload"))
      .toBe("নিরাপদ মেসেজ");
    expect(decodeLegacyChatPreview("🔒 Encrypted message"))
      .toBe("নিরাপদ মেসেজ");
  });
});
