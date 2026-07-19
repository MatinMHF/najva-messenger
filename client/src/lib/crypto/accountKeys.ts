/**
 * Account-key orchestration (docs/ENCRYPTION.md, "Register" / "Login" flows).
 *
 * The single place that assembles everything a new account needs and the
 * inverse unwrap on login. The server never sees the password: it receives a
 * derived `loginKey` plus opaque wrapped blobs. All primitives come from the
 * Phase 1 toolkit (kdf / envelope / primitives) — this module only composes.
 */
import {
  deriveFromPassword,
  DEFAULT_KEK_ITERATIONS,
  generateRecoveryCode,
  formatRecoveryCode,
  parseRecoveryCode,
  deriveRecoveryWrapKey,
  recoveryVerifierHash,
  derivePrfWrapKey,
} from './kdf';
import { wrapBytes, unwrapBytes, sealEnvelope } from './envelope';
import { generateDHKeyPair, generateSigningKeyPair, randomBytes } from './primitives';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const b64ToBytes = (b64: string): Uint8Array => new Uint8Array(base64ToArrayBuffer(b64));

// AAD context strings binding each wrap to its purpose (mirrored server-side
// in server/src/utils/accountCrypto.ts for the seed script).
const MK_WRAP_AAD = 'najva:mk:password:v1';
const PRIVATE_KEYS_AAD = 'najva:privatekeys:v1';

const RECOVERY_CODE_COUNT = 8;

export interface RecoveryCodeShare {
  verifierHash: string; // hex SHA-256 verifier (server-stored, @unique)
  wrappedMk: string; // MK wrapped by the code-derived RWK (envelope)
  wrapSalt: string; // b64 16B HKDF salt
}

export interface RegisterPayload {
  username: string;
  displayName: string;
  loginKey: string; // hex — what the server bcrypts
  kekSalt: string; // b64 16B
  kekIterations: number;
  mkPasswordWrapped: string; // MK wrapped under the password KEK (envelope)
  encryptedPrivateKeys: string; // identity/signing secrets wrapped under MK (envelope)
  identityKeyPublic: string; // b64 X25519 public
  identitySigningPublic: string; // b64 Ed25519 public
  recoveryCodes: RecoveryCodeShare[];
  savedMessagesKey: { wrappedKey: string }; // CK sealed to the account identity key
}

export interface RegistrationMaterial {
  payload: RegisterPayload;
  mk: Uint8Array; // cached in the device keystore after register
  identitySecret: Uint8Array; // kept in memory
  signingSecret: Uint8Array;
  recoveryCodesDisplay: string[]; // shown once, behind the acknowledgment gate
  savedMessagesCK: Uint8Array;
}

/**
 * Generate a fresh set of recovery-code shares for a given master key. Each
 * share is a `{verifierHash, wrappedMk, wrapSalt}` triple wrapping the SAME MK
 * under a code-derived RWK; the human-readable codes are returned separately for
 * one-time display. Reused by registration and by recovery-code regeneration.
 */
export const generateRecoveryCodeShares = async (
  mk: Uint8Array,
): Promise<{ recoveryCodes: RecoveryCodeShare[]; recoveryCodesDisplay: string[] }> => {
  const recoveryCodes: RecoveryCodeShare[] = [];
  const recoveryCodesDisplay: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generateRecoveryCode();
    const wrapSalt = randomBytes(16);
    const rwk = await deriveRecoveryWrapKey(code, wrapSalt);
    recoveryCodes.push({
      verifierHash: await recoveryVerifierHash(code),
      wrappedMk: await wrapBytes(rwk, mk),
      wrapSalt: arrayBufferToBase64(wrapSalt),
    });
    recoveryCodesDisplay.push(formatRecoveryCode(code));
    code.fill(0);
  }
  return { recoveryCodes, recoveryCodesDisplay };
};

const encodePrivateBundle = (identitySecret: Uint8Array, signingSecret: Uint8Array): Uint8Array =>
  utf8(
    JSON.stringify({
      identity: arrayBufferToBase64(identitySecret),
      signing: arrayBufferToBase64(signingSecret),
    }),
  );

export const createRegistrationMaterial = async (input: {
  username: string;
  displayName: string;
  password: string;
  iterations?: number;
}): Promise<RegistrationMaterial> => {
  const iterations = input.iterations ?? DEFAULT_KEK_ITERATIONS;
  const kekSalt = randomBytes(16);
  const { kek, loginKeyHex } = await deriveFromPassword(input.password, kekSalt, iterations);

  const mk = randomBytes(32);
  const identity = generateDHKeyPair(); // X25519
  const signing = generateSigningKeyPair(); // Ed25519

  const mkPasswordWrapped = await wrapBytes(kek, mk, MK_WRAP_AAD);
  const encryptedPrivateKeys = await wrapBytes(
    mk,
    encodePrivateBundle(identity.secretKey, signing.secretKey),
    PRIVATE_KEYS_AAD,
  );

  const { recoveryCodes, recoveryCodesDisplay } = await generateRecoveryCodeShares(mk);

  const savedMessagesCK = randomBytes(32);
  const savedWrapped = sealEnvelope(identity.publicKey, savedMessagesCK);

  return {
    payload: {
      username: input.username,
      displayName: input.displayName,
      loginKey: loginKeyHex,
      kekSalt: arrayBufferToBase64(kekSalt),
      kekIterations: iterations,
      mkPasswordWrapped,
      encryptedPrivateKeys,
      identityKeyPublic: arrayBufferToBase64(identity.publicKey),
      identitySigningPublic: arrayBufferToBase64(signing.publicKey),
      recoveryCodes,
      savedMessagesKey: { wrappedKey: savedWrapped },
    },
    mk,
    identitySecret: identity.secretKey,
    signingSecret: signing.secretKey,
    recoveryCodesDisplay,
    savedMessagesCK,
  };
};

export interface DerivedLogin {
  loginKeyHex: string;
  kek: Uint8Array;
}

/** From the password + server-provided KDF params, derive loginKey + KEK. */
export const deriveLoginKey = async (
  password: string,
  kekSaltB64: string,
  iterations: number,
): Promise<DerivedLogin> => {
  const { kek, loginKeyHex } = await deriveFromPassword(password, b64ToBytes(kekSaltB64), iterations);
  return { loginKeyHex, kek };
};

export interface UnlockedAccount {
  mk: Uint8Array;
  identitySecret: Uint8Array;
  signingSecret: Uint8Array;
}

/**
 * Unwrap just the master key with a password-derived KEK (no identity bundle).
 * Used by password change and recovery-code regeneration, where only the MK is
 * needed to re-wrap. A wrong password surfaces as a GCM auth failure.
 */
export const unwrapMasterKey = (kek: Uint8Array, mkPasswordWrapped: string): Promise<Uint8Array> =>
  unwrapBytes(kek, mkPasswordWrapped, MK_WRAP_AAD);

/**
 * Decrypt the identity/signing secrets directly from an already-unwrapped MK.
 * Used by passkey login/recovery (flow B), where the PRF path yields the MK
 * without ever deriving a password KEK.
 */
export const unlockIdentityFromMk = async (
  mk: Uint8Array,
  encryptedPrivateKeys: string,
): Promise<{ identitySecret: Uint8Array; signingSecret: Uint8Array }> => {
  const bundleBytes = await unwrapBytes(mk, encryptedPrivateKeys, PRIVATE_KEYS_AAD);
  const bundle = JSON.parse(new TextDecoder().decode(bundleBytes)) as { identity: string; signing: string };
  return {
    identitySecret: b64ToBytes(bundle.identity),
    signingSecret: b64ToBytes(bundle.signing),
  };
};

/** Unwrap the MK with the KEK, then decrypt the identity secrets under the MK. */
export const unlockAccount = async (input: {
  kek: Uint8Array;
  mkPasswordWrapped: string;
  encryptedPrivateKeys: string;
}): Promise<UnlockedAccount> => {
  const mk = await unwrapBytes(input.kek, input.mkPasswordWrapped, MK_WRAP_AAD);
  const bundleBytes = await unwrapBytes(mk, input.encryptedPrivateKeys, PRIVATE_KEYS_AAD);
  const bundle = JSON.parse(new TextDecoder().decode(bundleBytes)) as { identity: string; signing: string };
  return {
    mk,
    identitySecret: b64ToBytes(bundle.identity),
    signingSecret: b64ToBytes(bundle.signing),
  };
};

export interface RewrappedPassword {
  loginKey: string; // hex — the new "password" the server bcrypts
  kekSalt: string; // b64 16B
  kekIterations: number;
  mkPasswordWrapped: string; // MK re-wrapped under the new password KEK (envelope)
}

/**
 * Re-wrap the SAME master key under a freshly-derived KEK for a new password.
 * Used by password change and by recovery-flow-A completion: a new random salt,
 * a new KEK + loginKey, and the MK re-sealed. The MK itself never changes, so
 * recovery-code and passkey wraps stay valid.
 */
export const rewrapMasterKey = async (
  mk: Uint8Array,
  newPassword: string,
  iterations: number = DEFAULT_KEK_ITERATIONS,
): Promise<RewrappedPassword> => {
  const kekSalt = randomBytes(16);
  const { kek, loginKeyHex } = await deriveFromPassword(newPassword, kekSalt, iterations);
  const mkPasswordWrapped = await wrapBytes(kek, mk, MK_WRAP_AAD);
  return {
    loginKey: loginKeyHex,
    kekSalt: arrayBufferToBase64(kekSalt),
    kekIterations: iterations,
    mkPasswordWrapped,
  };
};

/** Server-stored verifier hash for a user-typed recovery code (flow A step 1). */
export const recoveryVerifierFromInput = async (codeInput: string): Promise<string> => {
  const code = parseRecoveryCode(codeInput);
  try {
    return await recoveryVerifierHash(code);
  } finally {
    code.fill(0);
  }
};

/**
 * Unwrap the master key with a user-typed recovery code (flow A step 2). A wrong
 * code (that nonetheless matched a verifier, or a malformed one) surfaces as a
 * GCM auth failure — callers turn the thrown error into a friendly "invalid
 * code" message rather than a crash.
 */
export const unwrapMkWithRecoveryCode = async (
  codeInput: string,
  wrappedMk: string,
  wrapSaltB64: string,
): Promise<Uint8Array> => {
  const code = parseRecoveryCode(codeInput);
  try {
    const rwk = await deriveRecoveryWrapKey(code, b64ToBytes(wrapSaltB64));
    return await unwrapBytes(rwk, wrappedMk);
  } finally {
    code.fill(0);
  }
};

// ---------------------------------------------------------------------------
// Passkey PRF wrap (docs/ENCRYPTION.md flow B). A PRF-capable passkey yields a
// stable 32-byte output for (credential, prfSalt); HKDF turns it into the PWK
// that wraps the SAME master key. Domain separation lives in the HKDF info
// string ("najva:mk:prf:v1"), so — like the recovery-code wrap — no extra AAD
// is needed on the envelope.
// ---------------------------------------------------------------------------

/** Wrap the master key under a passkey PRF output (registration / harvest). */
export const wrapMkWithPrf = async (
  prfOutput: Uint8Array,
  prfSaltB64: string,
  mk: Uint8Array,
): Promise<string> => {
  const pwk = await derivePrfWrapKey(prfOutput, b64ToBytes(prfSaltB64));
  try {
    return await wrapBytes(pwk, mk);
  } finally {
    pwk.fill(0);
  }
};

/**
 * Unwrap the master key with a passkey PRF output (login unlock / recovery flow
 * B). A PRF output from the wrong credential surfaces as a GCM auth failure,
 * which callers turn into a friendly message rather than a crash.
 */
export const unwrapMkWithPrf = async (
  prfOutput: Uint8Array,
  prfSaltB64: string,
  wrappedMk: string,
): Promise<Uint8Array> => {
  const pwk = await derivePrfWrapKey(prfOutput, b64ToBytes(prfSaltB64));
  try {
    return await unwrapBytes(pwk, wrappedMk);
  } finally {
    pwk.fill(0);
  }
};

// ---------------------------------------------------------------------------
// In-memory identity holder. Identity secrets are needed raw by tweetnacl and
// must never be persisted unencrypted; they live only in module scope for the
// lifetime of the page (re-decrypted from encryptedPrivateKeys on next load).
// ---------------------------------------------------------------------------

let activeIdentity: { secret: Uint8Array; signing: Uint8Array } | null = null;

export const setActiveIdentity = (secret: Uint8Array, signing: Uint8Array): void => {
  activeIdentity = { secret, signing };
};

export const getActiveIdentity = (): { secret: Uint8Array; signing: Uint8Array } | null => activeIdentity;

export const clearActiveIdentity = (): void => {
  activeIdentity = null;
};
