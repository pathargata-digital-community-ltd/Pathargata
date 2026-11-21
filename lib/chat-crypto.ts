import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import * as naclUtil from "tweetnacl-util";
import { get, ref, set } from "firebase/database";
import { pathargataDb } from "@/lib/pathargata-firebase";

const KEY_PREFIX = "pathargata.chat.ed25519.box.v1.";
const DRAFT_KEY_PREFIX = "pathargata.chat.local-draft.v1.";
export type ChatEnvelope = { nonce: string; ciphertext: string };
export type EncryptedChatText = { version: 1; senderUid: string; for: Record<string, ChatEnvelope> };

nacl.setPRNG((target, length) => target.set(Crypto.getRandomBytes(length)));

function b64(bytes: Uint8Array) { return naclUtil.encodeBase64(bytes); }
function bytes(value: string) { return naclUtil.decodeBase64(value); }

async function getLocalDraftKey(uid: string) {
  const storageKey = `${DRAFT_KEY_PREFIX}${uid}`;
  let saved: string | null;
  try { saved = await SecureStore.getItemAsync(storageKey); }
  catch { throw new Error("CHAT_SECURE_STORAGE_UNAVAILABLE"); }
  if (saved) {
    const key = bytes(saved);
    if (key.length !== nacl.secretbox.keyLength) throw new Error("CHAT_DRAFT_KEY_INVALID");
    return key;
  }
  const key = Crypto.getRandomBytes(nacl.secretbox.keyLength);
  await SecureStore.setItemAsync(storageKey, b64(key), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return key;
}

/** Encrypts drafts before AsyncStorage persistence; the key never leaves secure device storage. */
export async function encryptLocalChatDraft(text: string, uid: string) {
  const key = await getLocalDraftKey(uid);
  const nonce = Crypto.getRandomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(naclUtil.decodeUTF8(text), nonce, key);
  return JSON.stringify({ version: 1, nonce: b64(nonce), ciphertext: b64(ciphertext) });
}

export async function decryptLocalChatDraft(serialized: string, uid: string) {
  const parsed = JSON.parse(serialized) as { version?: number; nonce?: string; ciphertext?: string };
  if (parsed.version !== 1 || typeof parsed.nonce !== "string" || typeof parsed.ciphertext !== "string") throw new Error("CHAT_DRAFT_INVALID");
  const key = await getLocalDraftKey(uid);
  const opened = nacl.secretbox.open(bytes(parsed.ciphertext), bytes(parsed.nonce), key);
  if (!opened) throw new Error("CHAT_DRAFT_DECRYPT_FAILED");
  return naclUtil.encodeUTF8(opened);
}

/** Creates once and keeps the private key only in this device's secure storage. */
export async function ensureChatKeyPair(uid: string) {
  const secureKey = `${KEY_PREFIX}${uid}`;
  let saved: string | null = null;
  try { saved = await SecureStore.getItemAsync(secureKey); }
  catch { throw new Error("CHAT_SECURE_STORAGE_UNAVAILABLE"); }
  let pair: nacl.BoxKeyPair;
  if (saved) {
    const secretKey = bytes(saved);
    if (secretKey.length !== nacl.box.secretKeyLength) throw new Error("CHAT_KEY_INVALID");
    const publicKey = nacl.box.keyPair.fromSecretKey(secretKey).publicKey;
    pair = { publicKey, secretKey };
  } else {
    pair = nacl.box.keyPair();
    await SecureStore.setItemAsync(secureKey, b64(pair.secretKey), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  const publicKey = b64(pair.publicKey);
  const publicPath = ref(pathargataDb, `chat_public_keys/${uid}`);
  const current = await get(publicPath);
  if (current.val()?.publicKey !== publicKey) await set(publicPath, { publicKey, version: 1, updatedAt: Date.now() });
  return { publicKey, secretKey: pair.secretKey };
}

export async function getPublicChatKey(uid: string) {
  const snapshot = await get(ref(pathargataDb, `chat_public_keys/${uid}`));
  const key = snapshot.val()?.publicKey;
  if (typeof key !== "string") throw new Error("CHAT_PEER_KEY_MISSING");
  const decoded = bytes(key);
  if (decoded.length !== nacl.box.publicKeyLength) throw new Error("CHAT_PEER_KEY_INVALID");
  return decoded;
}

export async function encryptChatText(text: string, ownUid: string, peerUid: string): Promise<EncryptedChatText> {
  const ownPair = await ensureChatKeyPair(ownUid);
  const peerPublicKey = await getPublicChatKey(peerUid);
  const nonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  const message = naclUtil.decodeUTF8(text);
  const ownNonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  const toPeer = nacl.box(message, nonce, peerPublicKey, ownPair.secretKey);
  const toSelf = nacl.box(message, ownNonce, bytes(ownPair.publicKey), ownPair.secretKey);
  return { version: 1, senderUid: ownUid, for: {
    [peerUid]: { nonce: b64(nonce), ciphertext: b64(toPeer) },
    [ownUid]: { nonce: b64(ownNonce), ciphertext: b64(toSelf) },
  } };
}

export async function decryptChatText(envelope: EncryptedChatText, uid: string): Promise<string> {
  const payload = envelope.for?.[uid];
  if (!payload) throw new Error("CHAT_ENVELOPE_MISSING");
  const own = await ensureChatKeyPair(uid);
  // The sender public key is included as authenticated routing metadata.
  const senderKey = envelope.senderUid === uid ? bytes(own.publicKey) : await getPublicChatKey(envelope.senderUid);
  const opened = nacl.box.open(bytes(payload.ciphertext), bytes(payload.nonce), senderKey, own.secretKey);
  if (!opened) throw new Error("CHAT_DECRYPT_FAILED");
  return naclUtil.encodeUTF8(opened);
}
