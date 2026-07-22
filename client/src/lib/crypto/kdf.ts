/**
 * Password / recovery-code / PRF key derivation (docs/ENCRYPTION.md).
 *
 * One slow PBKDF2 run per password, HKDF-split into two independent keys:
 *  - KEK    — wraps the Master Key; never leaves the client
 *  - loginKey — sent to the server instead of the password; server bcrypts it
 */
import { hkdf, randomBytes } from './primitives';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const EMPTY_SALT = new Uint8Array(0);

export const DEFAULT_KEK_ITERATIONS = 600_000;

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

export interface PasswordKeys {
  kek: Uint8Array; // 32B — never send to the server
  loginKeyHex: string; // 64 hex chars — the "password" the server sees
}

export const deriveFromPassword = async (
  password: string,
  kekSalt: Uint8Array,
  iterations: number,
): Promise<PasswordKeys> => {
  const subtle = globalThis.crypto?.subtle;
  const pwKey = await subtle.importKey('raw', utf8(password) as unknown as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const prkBits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: kekSalt as unknown as BufferSource, iterations },
    pwKey,
    256,
  );
  const prk = new Uint8Array(prkBits);
  const kek = await hkdf(prk, EMPTY_SALT, utf8('najva:kek:v1'), 32);
  const loginKey = await hkdf(prk, EMPTY_SALT, utf8('najva:login:v1'), 32);
  prk.fill(0);
  return { kek, loginKeyHex: toHex(loginKey) };
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const generateRecoveryCode = (): Uint8Array => randomBytes(16);

export const formatRecoveryCode = (code: Uint8Array): string => {
  if (code.length !== 16) throw new Error('recovery code must be 16 bytes');
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of code) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(acc << (5 - bits)) & 31];
  return [out.slice(0, 5), out.slice(5, 10), out.slice(10, 15), out.slice(15, 20), out.slice(20, 26)].join('-');
};

export const parseRecoveryCode = (formatted: string): Uint8Array => {
  const normalized = formatted
    .toUpperCase()
    .replace(/-/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (normalized.length !== 26) throw new Error('invalid recovery code length');
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of normalized) {
    const val = CROCKFORD.indexOf(ch);
    if (val === -1) throw new Error('invalid recovery code character');
    acc = (acc << 5) | val;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (out.length !== 16) throw new Error('invalid recovery code');
  return new Uint8Array(out);
};

export const deriveRecoveryWrapKey = (code: Uint8Array, wrapSalt: Uint8Array): Promise<Uint8Array> =>
  hkdf(code, wrapSalt, utf8('najva:mk:recovery:v1'), 32);

export const recoveryVerifierHash = async (code: Uint8Array): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  const prefix = utf8('najva:rc:verify:v1');
  const input = new Uint8Array(prefix.length + code.length);
  input.set(prefix, 0);
  input.set(code, prefix.length);
  const digest = await subtle.digest('SHA-256', input as unknown as BufferSource);
  return toHex(new Uint8Array(digest));
};

export const derivePrfWrapKey = (prfOutput: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array> =>
  hkdf(prfOutput, prfSalt, utf8('najva:mk:prf:v1'), 32);
