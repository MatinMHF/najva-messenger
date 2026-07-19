import { describe, it, expect } from 'vitest';
import {
  generateDHKeyPair, generateSigningKeyPair, dh, sign, verify,
  hkdf, aesGcmEncrypt, aesGcmDecrypt,
} from '../primitives';

const arr = (u: Uint8Array): number[] => Array.from(u);

describe('primitives: keys, dh, sign', () => {
  it('DH keypair produces 32-byte keys', () => {
    const kp = generateDHKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(32);
  });

  it('DH agreement is symmetric', () => {
    const a = generateDHKeyPair();
    const b = generateDHKeyPair();
    const ab = dh(a.secretKey, b.publicKey);
    const ba = dh(b.secretKey, a.publicKey);
    expect(arr(ab)).toEqual(arr(ba));
  });

  it('sign/verify round-trips and rejects tampering', () => {
    const s = generateSigningKeyPair();
    const msg = new Uint8Array([1, 2, 3, 4]);
    const sig = sign(msg, s.secretKey);
    expect(verify(msg, sig, s.publicKey)).toBe(true);
    const bad = new Uint8Array([9, 9, 9, 9]);
    expect(verify(bad, sig, s.publicKey)).toBe(false);
  });
});

describe('primitives: hkdf', () => {
  it('derives deterministic output of requested length', async () => {
    const ikm = new Uint8Array(32).fill(7);
    const salt = new Uint8Array(32).fill(0);
    const out1 = await hkdf(ikm, salt, new TextEncoder().encode('test'), 64);
    const out2 = await hkdf(ikm, salt, new TextEncoder().encode('test'), 64);
    expect(out1.length).toBe(64);
    expect(arr(out1)).toEqual(arr(out2));
  });

  it('different info yields different output', async () => {
    const ikm = new Uint8Array(32).fill(7);
    const salt = new Uint8Array(32).fill(0);
    const a = await hkdf(ikm, salt, new TextEncoder().encode('a'), 32);
    const b = await hkdf(ikm, salt, new TextEncoder().encode('b'), 32);
    expect(arr(a)).not.toEqual(arr(b));
  });
});

describe('primitives: aes-gcm', () => {
  it('encrypts and decrypts round-trip', async () => {
    const key = new Uint8Array(32).fill(3);
    const pt = new TextEncoder().encode('سلام دنیا'); // Persian, ensures UTF-8 safety
    const { ciphertext, iv } = await aesGcmEncrypt(key, pt);
    const out = await aesGcmDecrypt(key, ciphertext, iv);
    expect(new TextDecoder().decode(out)).toBe('سلام دنیا');
  });

  it('rejects wrong key', async () => {
    const key = new Uint8Array(32).fill(3);
    const wrong = new Uint8Array(32).fill(4);
    const { ciphertext, iv } = await aesGcmEncrypt(key, new Uint8Array([1, 2, 3]));
    await expect(aesGcmDecrypt(wrong, ciphertext, iv)).rejects.toBeTruthy();
  });
});
