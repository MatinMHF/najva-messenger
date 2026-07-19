/**
 * Message content encryption (docs/ENCRYPTION.md, "Send / receive message").
 * AES-256-GCM under the Conversation Key, bound to its context via AAD
 * `najva:msg:v1:{conversationId}:{ckVersion}` so ciphertext cannot be spliced
 * across conversations or key versions. Plaintext exists only in memory here;
 * the server receives base64 ciphertext + iv + the CK version used.
 */
import { getCK } from './conversationKeys';
import { aesGcmEncrypt, aesGcmDecrypt } from './primitives';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64ToBytes = (b64: string): Uint8Array => new Uint8Array(base64ToArrayBuffer(b64));

const msgAAD = (conversationId: string, version: number): Uint8Array =>
  encoder.encode(`najva:msg:v1:${conversationId}:${version}`);

export interface EncryptedContent {
  encryptedContent: string; // base64 AES-GCM ciphertext
  iv: string; // base64 12-byte IV
  senderKeyVersion: number;
}

/** Encrypt message text under the conversation's current CK version. */
export const encryptContent = async (
  conversationId: string,
  version: number,
  plaintext: string,
): Promise<EncryptedContent> => {
  const ck = await getCK(conversationId, version);
  const { ciphertext, iv } = await aesGcmEncrypt(ck, encoder.encode(plaintext), msgAAD(conversationId, version));
  return {
    encryptedContent: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    senderKeyVersion: version,
  };
};

export interface DecryptedContent {
  text: string;
  undecryptable: boolean;
}

export interface DecryptableMessage {
  encryptedContent: string;
  iv?: string | null;
  senderKeyVersion?: number | null;
  isSystemPlaintext?: boolean;
}

/**
 * Decrypt a stored/received message. Server-authored SYSTEM messages
 * (`isSystemPlaintext`) render raw. Any failure — missing CK, wrong version,
 * GCM tag mismatch (tampering / AAD mismatch) — resolves to
 * `{ undecryptable: true }` so the UI shows a non-crashing placeholder bubble.
 */
export const decryptContent = async (
  conversationId: string,
  msg: DecryptableMessage,
): Promise<DecryptedContent> => {
  if (msg.isSystemPlaintext) return { text: msg.encryptedContent, undecryptable: false };
  try {
    if (!msg.iv) throw new Error('missing iv');
    const version = msg.senderKeyVersion ?? 1;
    const ck = await getCK(conversationId, version);
    const pt = await aesGcmDecrypt(ck, b64ToBytes(msg.encryptedContent), b64ToBytes(msg.iv), msgAAD(conversationId, version));
    return { text: decoder.decode(pt), undecryptable: false };
  } catch {
    return { text: '', undecryptable: true };
  }
};
