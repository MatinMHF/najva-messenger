import { describe, it, expect } from 'vitest';
import {
  generateDHKeyPair,
  sealTo,
  openSealed,
  aesGcmEncrypt,
  aesGcmDecrypt,
  randomBytes,
} from '../primitives';

describe('sealed box (sealTo / openSealed)', () => {
  it('round-trips: anyone can seal to a public key, only the secret key opens', () => {
    const recipient = generateDHKeyPair();
    const msg = randomBytes(32);
    const blob = sealTo(recipient.publicKey, msg);
    expect(openSealed(recipient.secretKey, blob)).toEqual(msg);
  });

  it('produces different blobs for the same message (ephemeral key + nonce)', () => {
    const recipient = generateDHKeyPair();
    const msg = randomBytes(32);
    expect(sealTo(recipient.publicKey, msg)).not.toEqual(sealTo(recipient.publicKey, msg));
  });

  it('rejects tampered blobs', () => {
    const recipient = generateDHKeyPair();
    const blob = sealTo(recipient.publicKey, randomBytes(32));
    blob[blob.length - 1] ^= 0xff;
    expect(() => openSealed(recipient.secretKey, blob)).toThrow();
  });

  it('rejects the wrong secret key', () => {
    const recipient = generateDHKeyPair();
    const other = generateDHKeyPair();
    const blob = sealTo(recipient.publicKey, randomBytes(32));
    expect(() => openSealed(other.secretKey, blob)).toThrow();
  });
});

describe('AES-GCM with AAD', () => {
  it('round-trips with matching AAD', async () => {
    const key = randomBytes(32);
    const pt = new TextEncoder().encode('salam');
    const aad = new TextEncoder().encode('najva:msg:v1:conv-1:1');
    const { ciphertext, iv } = await aesGcmEncrypt(key, pt, aad);
    expect(await aesGcmDecrypt(key, ciphertext, iv, aad)).toEqual(pt);
  });

  it('rejects mismatched AAD (cross-context splice)', async () => {
    const key = randomBytes(32);
    const pt = new TextEncoder().encode('salam');
    const aad1 = new TextEncoder().encode('najva:msg:v1:conv-1:1');
    const aad2 = new TextEncoder().encode('najva:msg:v1:conv-2:1');
    const { ciphertext, iv } = await aesGcmEncrypt(key, pt, aad1);
    await expect(aesGcmDecrypt(key, ciphertext, iv, aad2)).rejects.toThrow();
  });

  it('stays backward compatible without AAD', async () => {
    const key = randomBytes(32);
    const pt = new TextEncoder().encode('no aad');
    const { ciphertext, iv } = await aesGcmEncrypt(key, pt);
    expect(await aesGcmDecrypt(key, ciphertext, iv)).toEqual(pt);
  });
});
