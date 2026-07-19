/**
 * Server-side mirror of the client account-key crypto (docs/ENCRYPTION.md).
 *
 * Used ONLY by the seed script to provision fully-functional E2EE accounts
 * (e.g. admin) whose wrapped blobs the client can unwrap on login. It must
 * stay byte-compatible with client/src/lib/crypto/{kdf,envelope,accountKeys}.ts:
 * same PBKDF2/HKDF params + info strings, same AES-256-GCM envelope layout
 * (ct = ciphertext ‖ 16-byte GCM tag, matching WebCrypto), same tweetnacl
 * sealed-box format.
 */
import crypto from 'crypto';
import nacl from 'tweetnacl';

export const DEFAULT_KEK_ITERATIONS = 600000;

const MK_WRAP_AAD = 'najva:mk:password:v1';
const PRIVATE_KEYS_AAD = 'najva:privatekeys:v1';

const utf8 = (s: string) => Buffer.from(s, 'utf8');
const hkdf = (ikm: Buffer, salt: Buffer, info: string, len: number): Buffer =>
  Buffer.from(crypto.hkdfSync('sha256', ikm, salt, utf8(info), len));

export interface PasswordKeys {
  kek: Buffer;
  loginKeyHex: string;
  kekSalt: Buffer;
  kekIterations: number;
}

export const deriveFromPassword = (
  password: string,
  kekSalt: Buffer,
  iterations = DEFAULT_KEK_ITERATIONS,
): PasswordKeys => {
  const prk = crypto.pbkdf2Sync(utf8(password), kekSalt, iterations, 32, 'sha256');
  const kek = hkdf(prk, Buffer.alloc(0), 'najva:kek:v1', 32);
  const loginKey = hkdf(prk, Buffer.alloc(0), 'najva:login:v1', 32);
  return { kek, loginKeyHex: loginKey.toString('hex'), kekSalt, kekIterations: iterations };
};

/** AES-256-GCM wrap producing the client-compatible envelope string. */
export const wrapBytes = (key: Buffer, plaintext: Buffer, aad?: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(utf8(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64'),
    ct: Buffer.concat([ct, tag]).toString('base64'),
  });
};

/** Seal bytes to an X25519 public key (tweetnacl sealed-box layout). */
export const sealEnvelope = (recipientPublicKey: Uint8Array, message: Uint8Array): string => {
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const box = nacl.box(message, nonce, recipientPublicKey, eph.secretKey);
  const blob = new Uint8Array(32 + 24 + box.length);
  blob.set(eph.publicKey, 0);
  blob.set(nonce, 32);
  blob.set(box, 56);
  return JSON.stringify({ v: 1, alg: 'sealbox', ct: Buffer.from(blob).toString('base64') });
};

export interface AccountMaterial {
  passwordHash: string; // caller bcrypts loginKeyHex
  loginKeyHex: string;
  kekSalt: string; // b64
  kekIterations: number;
  mkPasswordWrapped: string;
  encryptedPrivateKeys: string;
  identityKeyPublic: string; // b64
  identitySigningPublic: string; // b64
  savedMessagesWrappedKey: string; // sealed CK
}

/** Build every wrapped blob a fully-functional account needs. */
export const buildAccountMaterial = (password: string): Omit<AccountMaterial, 'passwordHash'> => {
  const kekSalt = crypto.randomBytes(16);
  const { kek, loginKeyHex, kekIterations } = deriveFromPassword(password, kekSalt);

  const mk = crypto.randomBytes(32);
  const identity = nacl.box.keyPair();
  const signing = nacl.sign.keyPair();

  const bundle = utf8(
    JSON.stringify({
      identity: Buffer.from(identity.secretKey).toString('base64'),
      signing: Buffer.from(signing.secretKey).toString('base64'),
    }),
  );

  const savedCk = crypto.randomBytes(32);

  return {
    loginKeyHex,
    kekSalt: kekSalt.toString('base64'),
    kekIterations,
    mkPasswordWrapped: wrapBytes(kek, mk, MK_WRAP_AAD),
    encryptedPrivateKeys: wrapBytes(mk, bundle, PRIVATE_KEYS_AAD),
    identityKeyPublic: Buffer.from(identity.publicKey).toString('base64'),
    identitySigningPublic: Buffer.from(signing.publicKey).toString('base64'),
    savedMessagesWrappedKey: sealEnvelope(identity.publicKey, savedCk),
  };
};
