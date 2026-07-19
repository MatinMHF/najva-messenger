import nacl from 'tweetnacl';

export interface DHKeyPair { publicKey: Uint8Array; secretKey: Uint8Array; }
export interface SigningKeyPair { publicKey: Uint8Array; secretKey: Uint8Array; }

/** X25519 keypair for Diffie-Hellman. */
export const generateDHKeyPair = (): DHKeyPair => {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
};

/** Ed25519 keypair for signatures. */
export const generateSigningKeyPair = (): SigningKeyPair => {
  const kp = nacl.sign.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
};

/** X25519 scalar multiplication (DH agreement). Returns 32-byte shared secret. */
export const dh = (secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array =>
  nacl.scalarMult(secretKey, publicKey);

/** Ed25519 detached signature. */
export const sign = (message: Uint8Array, signingSecretKey: Uint8Array): Uint8Array =>
  nacl.sign.detached(message, signingSecretKey);

export const verify = (message: Uint8Array, signature: Uint8Array, signingPublicKey: Uint8Array): boolean =>
  nacl.sign.detached.verify(message, signature, signingPublicKey);

export const randomBytes = (n: number): Uint8Array => nacl.randomBytes(n);

/** HKDF-SHA256. Returns `length` bytes. */
export const hkdf = async (
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> => {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', ikm as unknown as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as unknown as BufferSource, info: info as unknown as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
};

export interface AesGcmResult { ciphertext: Uint8Array; iv: Uint8Array; }

export const aesGcmEncrypt = async (
  key: Uint8Array,
  plaintext: Uint8Array,
  additionalData?: Uint8Array,
): Promise<AesGcmResult> => {
  const subtle = globalThis.crypto.subtle;
  const iv = randomBytes(12);
  const cryptoKey = await subtle.importKey('raw', key as unknown as BufferSource, 'AES-GCM', false, ['encrypt']);
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as unknown as BufferSource };
  if (additionalData) params.additionalData = additionalData as unknown as BufferSource;
  const ct = await subtle.encrypt(params, cryptoKey, plaintext as unknown as BufferSource);
  return { ciphertext: new Uint8Array(ct), iv };
};

export const aesGcmDecrypt = async (
  key: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array,
): Promise<Uint8Array> => {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey('raw', key as unknown as BufferSource, 'AES-GCM', false, ['decrypt']);
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as unknown as BufferSource };
  if (additionalData) params.additionalData = additionalData as unknown as BufferSource;
  const pt = await subtle.decrypt(params, cryptoKey, ciphertext as unknown as BufferSource);
  return new Uint8Array(pt);
};

// ---------------------------------------------------------------------------
// Sealed box: asymmetric wrap so a sender needs only the recipient's public
// key (tweetnacl has no crypto_box_seal; built from an ephemeral keypair).
// Blob layout: ephPub(32) ‖ nonce(24) ‖ nacl.box(msg)
// ---------------------------------------------------------------------------

export const sealTo = (recipientPublicKey: Uint8Array, message: Uint8Array): Uint8Array => {
  const eph = nacl.box.keyPair();
  const nonce = randomBytes(24);
  const box = nacl.box(message, nonce, recipientPublicKey, eph.secretKey);
  const out = new Uint8Array(32 + 24 + box.length);
  out.set(eph.publicKey, 0);
  out.set(nonce, 32);
  out.set(box, 56);
  eph.secretKey.fill(0);
  return out;
};

export const openSealed = (recipientSecretKey: Uint8Array, blob: Uint8Array): Uint8Array => {
  if (blob.length < 56 + nacl.box.overheadLength) throw new Error('sealed box too short');
  const ephPub = blob.subarray(0, 32);
  const nonce = blob.subarray(32, 56);
  const box = blob.subarray(56);
  const opened = nacl.box.open(box, nonce, ephPub, recipientSecretKey);
  if (!opened) throw new Error('sealed box: decryption failed');
  return opened;
};
