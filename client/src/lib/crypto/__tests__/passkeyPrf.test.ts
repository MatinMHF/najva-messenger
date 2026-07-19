import { describe, it, expect } from 'vitest';
import { wrapMkWithPrf, unwrapMkWithPrf } from '../accountKeys';
import { derivePrfWrapKey } from '../kdf';
import { arrayBufferToBase64 } from '../utils';

// Fixed vectors: a deterministic PRF output + salt + master key so the wrap /
// unwrap round-trip is reproducible (docs/ENCRYPTION.md flow B: PWK = HKDF over
// the passkey PRF output, salt=prfSalt, info="najva:mk:prf:v1").
const prfOutput = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const prfSalt = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff);
const prfSaltB64 = arrayBufferToBase64(prfSalt);
const mk = new Uint8Array(32).map((_, i) => (i * 13 + 1) & 0xff);

describe('passkey PRF → PWK → MK wrap/unwrap (flow B)', () => {
  it('round-trips the master key through a PRF-derived wrap key', async () => {
    const wrapped = await wrapMkWithPrf(prfOutput, prfSaltB64, mk);
    const recovered = await unwrapMkWithPrf(prfOutput, prfSaltB64, wrapped);
    expect(recovered).toEqual(mk);
  });

  it('is randomized per wrap (fresh IV) yet always unwraps to the same MK', async () => {
    const a = await wrapMkWithPrf(prfOutput, prfSaltB64, mk);
    const b = await wrapMkWithPrf(prfOutput, prfSaltB64, mk);
    expect(a).not.toBe(b); // distinct envelopes (random IV)
    expect(await unwrapMkWithPrf(prfOutput, prfSaltB64, a)).toEqual(mk);
    expect(await unwrapMkWithPrf(prfOutput, prfSaltB64, b)).toEqual(mk);
  });

  it('a WRONG PRF output (different credential) fails to unwrap', async () => {
    const wrapped = await wrapMkWithPrf(prfOutput, prfSaltB64, mk);
    const wrongOutput = new Uint8Array(32).map((_, i) => (i * 3 + 9) & 0xff);
    await expect(unwrapMkWithPrf(wrongOutput, prfSaltB64, wrapped)).rejects.toThrow();
  });

  it('a WRONG prfSalt fails to unwrap (salt binds the derivation)', async () => {
    const wrapped = await wrapMkWithPrf(prfOutput, prfSaltB64, mk);
    const otherSalt = arrayBufferToBase64(new Uint8Array(32).fill(9));
    await expect(unwrapMkWithPrf(prfOutput, otherSalt, wrapped)).rejects.toThrow();
  });

  it('PWK derivation is stable for identical (prfOutput, prfSalt)', async () => {
    const k1 = await derivePrfWrapKey(prfOutput, prfSalt);
    const k2 = await derivePrfWrapKey(prfOutput, prfSalt);
    expect(k1).toEqual(k2);
    expect(k1.length).toBe(32);
  });
});
