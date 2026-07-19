/**
 * WebAuthn / passkey client orchestration (docs/ENCRYPTION.md flow B).
 *
 * @simplewebauthn/browser drives the standard register/authenticate ceremonies
 * (it handles all base64url <-> buffer conversions the server verifier expects),
 * but it does NOT touch the `prf` extension. So the PRF salt is injected as raw
 * bytes and the PRF output is read straight off `getClientExtensionResults()`.
 * Because a discoverable login can't know which credential (and thus which
 * per-credential salt) will be chosen, PRF unlock on login/recovery uses a
 * short follow-up `get()` targeting the now-known credential — one extra prompt,
 * and the only shape Safari supports (PRF is exposed on get(), not create()).
 */
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  base64URLStringToBuffer,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import api from './api';
import { wrapMkWithPrf, unwrapMkWithPrf } from './crypto/accountKeys';

export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

const randomChallenge = (): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(32));

const readPrfFirst = (results: unknown): Uint8Array | null => {
  const first = (results as { prf?: { results?: { first?: ArrayBuffer } } })?.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
};

/**
 * Evaluate a credential's PRF for its salt via a raw `get()` (Safari-safe).
 * Returns the 32-byte PRF output, or null when the authenticator has no PRF.
 */
export const evaluatePrf = async (credentialId: string, prfSaltB64: string): Promise<Uint8Array | null> => {
  if (!browserSupportsWebAuthn()) return null;
  const salt = new Uint8Array(prfSaltFromB64(prfSaltB64));
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge() as BufferSource,
        allowCredentials: [{ id: base64URLStringToBuffer(credentialId), type: 'public-key' }],
        userVerification: 'preferred',
        // DOM lib lacks the PRF extension typing; the salt must be raw bytes.
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return null;
    return readPrfFirst(cred.getClientExtensionResults());
  } catch {
    return null;
  }
};

const prfSaltFromB64 = (b64: string): ArrayBuffer => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

// ---- Registration (authed) ----------------------------------------------

export interface RegisterResult {
  prfSupported: boolean;
}

/**
 * Register a new passkey for the signed-in user. When the authenticator supports
 * PRF, harvest it and upload the MK wrapped under the PWK so this passkey can
 * later recover the account; otherwise it registers as sign-in only.
 */
export const registerPasskey = async (deviceName: string, mk: Uint8Array): Promise<RegisterResult> => {
  const { data } = await api.post('/auth/webauthn/register/options', {});
  const options = data.options as PublicKeyCredentialCreationOptionsJSON;
  const prfSalt = data.prfSalt as string;

  // Request PRF in the create ceremony too — some platforms surface it here.
  const salt = new Uint8Array(prfSaltFromB64(prfSalt));
  const optionsWithPrf = {
    ...options,
    extensions: {
      ...(options.extensions ?? {}),
      prf: { eval: { first: salt } },
    },
  } as PublicKeyCredentialCreationOptionsJSON;

  const attResp = await startRegistration({ optionsJSON: optionsWithPrf });

  // Prefer a PRF output surfaced at create; otherwise harvest with a get().
  let prfOut = readPrfFirst(attResp.clientExtensionResults);
  if (!prfOut) prfOut = await evaluatePrf(attResp.id, prfSalt);

  let wrappedMk: string | undefined;
  if (prfOut) {
    wrappedMk = await wrapMkWithPrf(prfOut, prfSalt, mk);
    prfOut.fill(0);
  }

  const { data: verified } = await api.post('/auth/webauthn/register/verify', {
    response: attResp,
    deviceName,
    wrappedMk,
  });
  return { prfSupported: !!verified.prfSupported };
};

// ---- Credential management (authed) -------------------------------------

export interface PasskeyInfo {
  id: string;
  deviceName: string | null;
  prfSupported: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export const listPasskeys = async (): Promise<PasskeyInfo[]> => {
  const { data } = await api.get('/auth/webauthn/credentials');
  return (data.credentials ?? []) as PasskeyInfo[];
};

export const renamePasskey = (id: string, deviceName: string): Promise<unknown> =>
  api.patch(`/auth/webauthn/credentials/${id}`, { deviceName });

export const deletePasskey = (id: string, loginKey: string): Promise<unknown> =>
  api.delete(`/auth/webauthn/credentials/${id}`, { data: { loginKey } });

// ---- Login (discoverable, unauthed) -------------------------------------

export interface PasskeyLoginResult {
  credentialId: string;
  user: { id: string; username: string; displayName: string | null; totpEnabled?: boolean };
  token: string;
  prfSupported: boolean;
  prfSalt: string | null;
  wrappedMk: string | null;
  mkPasswordWrapped: string | null;
  encryptedPrivateKeys: string | null;
  kekSalt: string | null;
  kekIterations: number | null;
}

/** Discoverable-credential login. Returns the session + material to unlock MK. */
export const loginWithPasskey = async (): Promise<PasskeyLoginResult> => {
  const { data: opt } = await api.post('/auth/webauthn/login/options', {});
  const authResp = await startAuthentication({
    optionsJSON: opt.options as PublicKeyCredentialRequestOptionsJSON,
  });
  const { data } = await api.post('/auth/webauthn/login/verify', {
    challengeId: opt.challengeId,
    response: authResp,
  });
  return {
    credentialId: authResp.id,
    user: data.user,
    token: data.tokens.accessToken,
    prfSupported: !!data.prfSupported,
    prfSalt: data.prfSalt ?? null,
    wrappedMk: data.wrappedMk ?? null,
    mkPasswordWrapped: data.mkPasswordWrapped ?? null,
    encryptedPrivateKeys: data.encryptedPrivateKeys ?? null,
    kekSalt: data.kekSalt ?? null,
    kekIterations: data.kekIterations ?? null,
  };
};

/**
 * Unlock the master key after a PRF-capable passkey login: re-evaluate the
 * credential's PRF and unwrap. Returns null if PRF is unavailable or the unwrap
 * fails (caller falls back to a password prompt / leaves MK locked).
 */
export const unlockMkWithPasskey = async (
  credentialId: string,
  prfSalt: string | null,
  wrappedMk: string | null,
): Promise<Uint8Array | null> => {
  if (!prfSalt || !wrappedMk) return null;
  const prfOut = await evaluatePrf(credentialId, prfSalt);
  if (!prfOut) return null;
  try {
    return await unwrapMkWithPrf(prfOut, prfSalt, wrappedMk);
  } catch {
    return null;
  } finally {
    prfOut.fill(0);
  }
};

// ---- Recovery flow B (unauthed) -----------------------------------------

export interface PasskeyRecoverResult {
  credentialId: string;
  wrappedMk: string;
  prfSalt: string;
  encryptedPrivateKeys: string;
  recoveryToken: string;
}

/**
 * Recovery flow B: a passkey assertion that (server-side) only succeeds for
 * PRF-capable credentials, returning the wrapped MK + a single-use recovery
 * token to feed into the shared /auth/recover/complete.
 */
export const recoverWithPasskey = async (): Promise<PasskeyRecoverResult> => {
  const { data: opt } = await api.post('/auth/webauthn/recover/options', {});
  const authResp = await startAuthentication({
    optionsJSON: opt.options as PublicKeyCredentialRequestOptionsJSON,
  });
  const { data } = await api.post('/auth/webauthn/recover/verify', {
    challengeId: opt.challengeId,
    response: authResp,
  });
  return {
    credentialId: authResp.id,
    wrappedMk: data.wrappedMk,
    prfSalt: data.prfSalt,
    encryptedPrivateKeys: data.encryptedPrivateKeys,
    recoveryToken: data.recoveryToken,
  };
};
