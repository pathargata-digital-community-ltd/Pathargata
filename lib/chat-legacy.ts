import CryptoJS from "crypto-js";

const LEGACY_CHAT_SECRET = "PatharghataDigitalSecretKey";
const SAFE_MESSAGE_LABEL = "নিরাপদ মেসেজ";

export function decodeLegacyChatText(value?: string) {
  if (!value) return "";
  const text = value.trim();
  if (!text) return "";
  if (/^(?:🔒\s*)?(?:encrypted message|নিরাপদ মেসেজ)$/i.test(text)) {
    return SAFE_MESSAGE_LABEL;
  }

  try {
    const plaintext = CryptoJS.AES.decrypt(text, LEGACY_CHAT_SECRET).toString(
      CryptoJS.enc.Utf8,
    );
    if (plaintext && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(plaintext)) return plaintext;
  } catch {
    // Legacy data may be plain text or may have been encrypted by another client.
  }

  const looksEncrypted =
    text.startsWith("U2FsdGVkX1") ||
    (text.length >= 56 && /^[A-Za-z0-9+/=_-]+$/.test(text));
  return looksEncrypted ? SAFE_MESSAGE_LABEL : text;
}

export function decodeLegacyChatPreview(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  const ownMessagePrefix = /^You:\s*/i.test(trimmed);
  const body = ownMessagePrefix ? trimmed.replace(/^You:\s*/i, "") : trimmed;
  const decoded = decodeLegacyChatText(body);
  if (!decoded) return "";
  return ownMessagePrefix ? `আপনি: ${decoded}` : decoded;
}
