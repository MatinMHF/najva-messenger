import { describe, it, expect } from 'vitest';
import {
  deriveFromPassword,
  generateRecoveryCode,
  formatRecoveryCode,
  parseRecoveryCode,
  deriveRecoveryWrapKey,
  recoveryVerifierHash,
  derivePrfWrapKey,
} from '../kdf';
import { randomBytes } from '../primitives';

// Low iteration count in tests: correctness, not hardness.
const ITER = 1000;

describe('deriveFromPassword', () => {
  it('is deterministic for the same password + salt + iterations', async () => {
    const salt = new Uint8Array(16).fill(7);
    const a = await deriveFromPassword('correct horse', salt, ITER);
    const b = await deriveFromPassword('correct horse', salt, ITER);
    expect(a.kek).toEqual(b.kek);
    expect(a.loginKeyHex).toEqual(b.loginKeyHex);
  });

  it('produces different keys for different salts', async () => {
    const a = await deriveFromPassword('pw', new Uint8Array(16).fill(1), ITER);
    const b = await deriveFromPassword('pw', new Uint8Array(16).fill(2), ITER);
    expect(a.kek).not.toEqual(b.kek);
    expect(a.loginKeyHex).not.toEqual(b.loginKeyHex);
  });

  it('KEK and loginKey are independent (domain-separated)', async () => {
    const salt = randomBytes(16);
    const { kek, loginKeyHex } = await deriveFromPassword('pw', salt, ITER);
    expect(kek).toHaveLength(32);
    expect(loginKeyHex).toMatch(/^[0-9a-f]{64}$/);
    // hex of kek must not equal loginKey
    const kekHex = Array.from(kek).map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(kekHex).not.toEqual(loginKeyHex);
  });
});

describe('recovery codes', () => {
  it('generates 16-byte codes and formats as grouped Crockford base32', () => {
    const code = generateRecoveryCode();
    expect(code).toHaveLength(16);
    const formatted = formatRecoveryCode(code);
    expect(formatted).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('round-trips format → parse', () => {
    const code = generateRecoveryCode();
    expect(parseRecoveryCode(formatRecoveryCode(code))).toEqual(code);
  });

  it('parse tolerates lowercase and ambiguous chars (O→0, I/L→1)', () => {
    const code = generateRecoveryCode();
    const formatted = formatRecoveryCode(code)
      .toLowerCase()
      .replace(/0/g, 'o')
      .replace(/1/g, 'i');
    expect(parseRecoveryCode(formatted)).toEqual(code);
  });

  it('parse rejects malformed input', () => {
    expect(() => parseRecoveryCode('NOT-A-CODE')).toThrow();
    expect(() => parseRecoveryCode('UUUUU-UUUUU-UUUUU-UUUUU-UUUUUU')).toThrow(); // U not in alphabet
  });

  it('verifier hash and wrap key are domain-separated', async () => {
    const code = generateRecoveryCode();
    const wrapSalt = randomBytes(16);
    const verifier = await recoveryVerifierHash(code);
    const rwk = await deriveRecoveryWrapKey(code, wrapSalt);
    expect(verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(rwk).toHaveLength(32);
    const rwkHex = Array.from(rwk).map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(rwkHex).not.toEqual(verifier);
  });

  it('verifier hash is deterministic; wrap key depends on salt', async () => {
    const code = generateRecoveryCode();
    expect(await recoveryVerifierHash(code)).toEqual(await recoveryVerifierHash(code));
    const a = await deriveRecoveryWrapKey(code, new Uint8Array(16).fill(1));
    const b = await deriveRecoveryWrapKey(code, new Uint8Array(16).fill(2));
    expect(a).not.toEqual(b);
  });
});

describe('derivePrfWrapKey', () => {
  it('derives a 32-byte key deterministically from PRF output + salt', async () => {
    const prf = randomBytes(32);
    const salt = randomBytes(32);
    const a = await derivePrfWrapKey(prf, salt);
    const b = await derivePrfWrapKey(prf, salt);
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
  });
});
