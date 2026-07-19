/**
 * Versioned JSON envelopes for wrapped keys and ciphertext blobs
 * (docs/ENCRYPTION.md). Stored as opaque strings server-side.
 *
 *  {v:1, alg:"A256GCM", iv, ct}  — symmetric AEAD wrap
 *  {v:1, alg:"sealbox",  ct}     — sealed to an X25519 public key
 */
import { aesGcmEncrypt, aesGcmDecrypt, sealTo, openSealed } from './primitives';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

interface EnvelopeV1 {
  v: 1;
  alg: 'A256GCM' | 'sealbox';
  iv?: string;
  ct: string;
}

const parseEnvelope = (envelope: string, expectedAlg: EnvelopeV1['alg']): EnvelopeV1 => {
  let parsed: EnvelopeV1;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error('envelope: not valid JSON');
  }
  if (parsed.v !== 1) throw new Error(`envelope: unsupported version ${parsed.v}`);
  if (parsed.alg !== expectedAlg) throw new Error(`envelope: unexpected alg ${parsed.alg}`);
  return parsed;
};

/** AES-256-GCM wrap of arbitrary bytes under a 32-byte key. */
export const wrapBytes = async (key: Uint8Array, plaintext: Uint8Array, aad?: string): Promise<string> => {
  const { ciphertext, iv } = await aesGcmEncrypt(key, plaintext, aad ? utf8(aad) : undefined);
  const env: EnvelopeV1 = {
    v: 1,
    alg: 'A256GCM',
    iv: arrayBufferToBase64(iv),
    ct: arrayBufferToBase64(ciphertext),
  };
  return JSON.stringify(env);
};

export const unwrapBytes = async (key: Uint8Array, envelope: string, aad?: string): Promise<Uint8Array> => {
  const env = parseEnvelope(envelope, 'A256GCM');
  if (!env.iv) throw new Error('envelope: missing iv');
  return aesGcmDecrypt(
    key,
    new Uint8Array(base64ToArrayBuffer(env.ct)),
    new Uint8Array(base64ToArrayBuffer(env.iv)),
    aad ? utf8(aad) : undefined,
  );
};

/** Seal bytes to an X25519 public key (conversation-key distribution). */
export const sealEnvelope = (recipientPublicKey: Uint8Array, message: Uint8Array): string => {
  const blob = sealTo(recipientPublicKey, message);
  const env: EnvelopeV1 = { v: 1, alg: 'sealbox', ct: arrayBufferToBase64(blob) };
  return JSON.stringify(env);
};

export const openEnvelope = (recipientSecretKey: Uint8Array, envelope: string): Uint8Array => {
  const env = parseEnvelope(envelope, 'sealbox');
  return openSealed(recipientSecretKey, new Uint8Array(base64ToArrayBuffer(env.ct)));
};
