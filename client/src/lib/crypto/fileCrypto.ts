/**
 * Attachment encryption (docs/ENCRYPTION.md, "Attachments"). Each attachment
 * gets a fresh 32-byte File Key (FK) that AES-256-GCM encrypts the file bytes
 * (and, separately, its thumbnail) client-side BEFORE upload. The FK is then
 * wrapped by the Conversation Key so only conversation members can recover it;
 * the server stores an opaque blob plus the wrapped-FK envelope and never sees
 * the plaintext or the FK.
 *
 * Encrypted blob layout: iv(12) ‖ AES-GCM ciphertext.
 */
import { getCK } from './conversationKeys';
import { aesGcmEncrypt, aesGcmDecrypt, randomBytes } from './primitives';
import { wrapBytes, unwrapBytes } from './envelope';

const FILE_AAD = new TextEncoder().encode('najva:file:v1');

export interface EncryptedBlob {
  blob: Uint8Array; // iv ‖ ciphertext — uploaded as an opaque file
  encryptedKey: string; // FK wrapped by the CK (A256GCM envelope)
}

/** Encrypt bytes under a fresh FK and wrap that FK under the conversation key. */
export const encryptBytes = async (ck: Uint8Array, bytes: Uint8Array): Promise<EncryptedBlob> => {
  const fk = randomBytes(32);
  try {
    const { ciphertext, iv } = await aesGcmEncrypt(fk, bytes, FILE_AAD);
    const blob = new Uint8Array(12 + ciphertext.length);
    blob.set(iv, 0);
    blob.set(ciphertext, 12);
    const encryptedKey = await wrapBytes(ck, fk);
    return { blob, encryptedKey };
  } finally {
    fk.fill(0);
  }
};

/**
 * Encrypt bytes under a fresh FK, but reuse an FK you already unwrapped so a file
 * and its thumbnail share one wrapped key. Returns just the blob.
 */
export const encryptBytesWithFk = async (fk: Uint8Array, bytes: Uint8Array): Promise<Uint8Array> => {
  const { ciphertext, iv } = await aesGcmEncrypt(fk, bytes, FILE_AAD);
  const blob = new Uint8Array(12 + ciphertext.length);
  blob.set(iv, 0);
  blob.set(ciphertext, 12);
  return blob;
};

/** Recover the plaintext bytes from an encrypted blob + its CK-wrapped FK. */
export const decryptBytes = async (
  ck: Uint8Array,
  encryptedKey: string,
  blob: Uint8Array,
): Promise<Uint8Array> => {
  const fk = await unwrapBytes(ck, encryptedKey);
  try {
    const iv = blob.subarray(0, 12);
    const ct = blob.subarray(12);
    return await aesGcmDecrypt(fk, ct, iv, FILE_AAD);
  } finally {
    fk.fill(0);
  }
};

/** Encrypt file + optional thumbnail under ONE shared FK for a conversation. */
export const encryptAttachment = async (
  conversationId: string,
  version: number,
  fileBytes: Uint8Array,
  thumbnailBytes?: Uint8Array,
): Promise<{ blob: Uint8Array; thumbnailBlob?: Uint8Array; encryptedKey: string }> => {
  const ck = await getCK(conversationId, version);
  const fk = randomBytes(32);
  try {
    const blob = await encryptBytesWithFk(fk, fileBytes);
    const thumbnailBlob = thumbnailBytes ? await encryptBytesWithFk(fk, thumbnailBytes) : undefined;
    const encryptedKey = await wrapBytes(ck, fk);
    return { blob, thumbnailBlob, encryptedKey };
  } finally {
    fk.fill(0);
  }
};

/** Fetch the CK for (conv, version) and decrypt an attachment blob. */
export const decryptAttachment = async (
  conversationId: string,
  version: number,
  encryptedKey: string,
  blob: Uint8Array,
): Promise<Uint8Array> => {
  const ck = await getCK(conversationId, version);
  return decryptBytes(ck, encryptedKey, blob);
};
