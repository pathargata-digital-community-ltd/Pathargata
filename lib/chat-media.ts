import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import * as naclUtil from "tweetnacl-util";
import { pathargataAuth } from "@/lib/pathargata-firebase";
import { ensureChatKeyPair, getPublicChatKey } from "@/lib/chat-crypto";
import { getLocalMediaSize, uploadCloudinaryBlob, uploadImageFromUri } from "@/lib/media-upload";
import { assertPostVideoUploadsAllowed } from "@/lib/post-media-policy";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export type EncryptedChatImage = {
  version: 1;
  senderUid: string;
  url: string;
  contentType: string;
  nonce: string;
  keyFor: Record<string, { nonce: string; ciphertext: string }>;
};
export type EncryptedChatVoice = EncryptedChatImage;

function toBase64(value: Uint8Array) { return naclUtil.encodeBase64(value); }
function fromBase64(value: string) { return naclUtil.decodeBase64(value); }

const USER_MEDIA_POLICIES = {
  "chat-media": { maxBytes: 10 * 1024 * 1024, contentType: /^(image|audio)\/.+$/ },
  "profile-media": { maxBytes: 5 * 1024 * 1024, contentType: /^image\/(jpeg|jpg|png|webp)$/ },
  "post-audio": { maxBytes: 10 * 1024 * 1024, contentType: /^audio\/(mp4|mpeg|aac|wav|x-m4a|webm)$/ },
} as const;

export function validateUserMediaUpload(folder: string, contentType: string, size: number, extension: string) {
  // Post-video publishing is intentionally disabled across web and native.
  assertPostVideoUploadsAllowed(folder);
  const policy = USER_MEDIA_POLICIES[folder as keyof typeof USER_MEDIA_POLICIES];
  if (!policy || !/^[a-z0-9]{1,8}$/i.test(extension)) throw new Error("MEDIA_PATH_INVALID");
  if (!Number.isFinite(size) || size <= 0 || size >= policy.maxBytes) throw new Error("MEDIA_SIZE_INVALID");
  if (!policy.contentType.test(contentType.toLowerCase())) throw new Error("MEDIA_TYPE_INVALID");
}

export async function uploadUserMedia(uri: string, contentType: string, extension: string, folder = "chat-media", onProgress?: (progress: number) => void) {
  const uid = pathargataAuth.currentUser?.uid;
  if (!uid) throw new Error("AUTH_REQUIRED");
  const size = await getLocalMediaSize(uri);
  validateUserMediaUpload(folder, contentType, size, extension);
  const webFile = Platform.OS === "web" ? await (await fetch(uri)).blob() : undefined;
  // Keep unsigned Cloudinary, but send native file URIs directly. Android
  // content:// URIs are not reliably readable through fetch(uri).
  const uploaded = await uploadImageFromUri(uri, contentType, webFile, "Media", onProgress);
  return uploaded.url;
}

export async function uploadChatMedia(uri: string, contentType: string, extension: string) {
  return uploadUserMedia(uri, contentType, extension, "chat-media");
}

export async function encryptAndUploadChatVoice(uri: string, ownUid: string, peerUid: string): Promise<EncryptedChatVoice> {
  return encryptAndUploadChatImage(uri, "audio/mp4", ownUid, peerUid);
}

/** Encrypts image bytes before upload; only the two conversation participants receive the content key. */
export async function encryptAndUploadChatImage(uri: string, contentType: string, ownUid: string, peerUid: string): Promise<EncryptedChatImage> {
  if (pathargataAuth.currentUser?.uid !== ownUid) throw new Error("AUTH_REQUIRED");
  const response = await fetch(uri);
  if (!response.ok) throw new Error("MEDIA_READ_FAILED");
  const source = new Uint8Array(await response.arrayBuffer());
  if (source.byteLength === 0 || source.byteLength > 8 * 1024 * 1024) throw new Error("CHAT_IMAGE_SIZE_INVALID");

  const contentKey = Crypto.getRandomBytes(nacl.secretbox.keyLength);
  const nonce = Crypto.getRandomBytes(nacl.secretbox.nonceLength);
  const encryptedBytes = nacl.secretbox(source, nonce, contentKey);
  const ownPair = await ensureChatKeyPair(ownUid);
  const peerPublic = await getPublicChatKey(peerUid);
  const ownNonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  const peerNonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  const ownEnvelope = nacl.box(contentKey, ownNonce, fromBase64(ownPair.publicKey), ownPair.secretKey);
  const peerEnvelope = nacl.box(contentKey, peerNonce, peerPublic, ownPair.secretKey);

  const extension = contentType.includes("png") ? "png" : contentType.startsWith("audio/") ? "m4a" : "jpg";
  const encryptedBuffer = encryptedBytes.buffer.slice(
    encryptedBytes.byteOffset,
    encryptedBytes.byteOffset + encryptedBytes.byteLength,
  ) as ArrayBuffer;
  const encryptedBlob = new Blob([encryptedBuffer], { type: "application/octet-stream" });
  const uploaded = await uploadCloudinaryBlob(encryptedBlob, "application/octet-stream", `chat-media-${ownUid}-${Date.now()}.${extension}.enc`, "Media");
  const url = uploaded.url;
  return {
    version: 1,
    senderUid: ownUid,
    url,
    contentType,
    nonce: toBase64(nonce),
    keyFor: {
      [ownUid]: { nonce: toBase64(ownNonce), ciphertext: toBase64(ownEnvelope) },
      [peerUid]: { nonce: toBase64(peerNonce), ciphertext: toBase64(peerEnvelope) },
    },
  };
}

/** Downloads ciphertext and returns a local data URI only after authenticated decryption. */
export async function decryptChatImage(media: EncryptedChatImage, uid: string): Promise<string> {
  const envelope = media.keyFor?.[uid];
  if (!envelope) throw new Error("CHAT_IMAGE_KEY_MISSING");
  const ownPair = await ensureChatKeyPair(uid);
  const senderPublic = media.senderUid === uid ? fromBase64(ownPair.publicKey) : await getPublicChatKey(media.senderUid);
  const contentKey = nacl.box.open(fromBase64(envelope.ciphertext), fromBase64(envelope.nonce), senderPublic, ownPair.secretKey);
  if (!contentKey) throw new Error("CHAT_IMAGE_KEY_DECRYPT_FAILED");
  const response = await fetch(media.url);
  if (!response.ok) throw new Error("CHAT_IMAGE_DOWNLOAD_FAILED");
  const encryptedBytes = new Uint8Array(await response.arrayBuffer());
  const opened = nacl.secretbox.open(encryptedBytes, fromBase64(media.nonce), contentKey);
  if (!opened) throw new Error("CHAT_IMAGE_DECRYPT_FAILED");
  return `data:${media.contentType};base64,${toBase64(opened)}`;
}

export async function decryptChatVoice(media: EncryptedChatVoice, uid: string): Promise<string> {
  const dataUri = await decryptChatImage(media, uid);
  if (Platform.OS === "web") return dataUri;
  const base64 = dataUri.split(",", 2)[1];
  if (!base64 || !FileSystem.cacheDirectory) throw new Error("CHAT_VOICE_CACHE_UNAVAILABLE");
  const fileUri = `${FileSystem.cacheDirectory}chat-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}

/** Shares the existing encrypted blob with a new recipient by wrapping its content key for them. */
export async function forwardEncryptedChatMedia(media: EncryptedChatImage, ownUid: string, peerUid: string): Promise<EncryptedChatImage> {
  const ownEnvelope = media.keyFor?.[ownUid];
  if (!ownEnvelope) throw new Error("CHAT_MEDIA_KEY_MISSING");
  const ownPair = await ensureChatKeyPair(ownUid);
  const oldSenderPublic = media.senderUid === ownUid ? fromBase64(ownPair.publicKey) : await getPublicChatKey(media.senderUid);
  const contentKey = nacl.box.open(fromBase64(ownEnvelope.ciphertext), fromBase64(ownEnvelope.nonce), oldSenderPublic, ownPair.secretKey);
  if (!contentKey) throw new Error("CHAT_MEDIA_KEY_DECRYPT_FAILED");
  const recipientPublic = await getPublicChatKey(peerUid);
  const ownNonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  const peerNonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  return {
    ...media,
    senderUid: ownUid,
    keyFor: {
      [ownUid]: { nonce: toBase64(ownNonce), ciphertext: toBase64(nacl.box(contentKey, ownNonce, fromBase64(ownPair.publicKey), ownPair.secretKey)) },
      [peerUid]: { nonce: toBase64(peerNonce), ciphertext: toBase64(nacl.box(contentKey, peerNonce, recipientPublic, ownPair.secretKey)) },
    },
  };
}
