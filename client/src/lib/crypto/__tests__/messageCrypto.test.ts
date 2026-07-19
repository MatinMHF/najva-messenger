import { describe, it, expect, beforeEach } from 'vitest';
import { encryptContent, decryptContent } from '../messageCrypto';
import { generateCK, primeCK, clearCKCache } from '../conversationKeys';

beforeEach(() => {
  clearCKCache();
});

describe('message content encrypt/decrypt', () => {
  it('round-trips text under a primed CK', async () => {
    primeCK('conv1', 1, generateCK());
    const enc = await encryptContent('conv1', 1, 'hello e2ee');
    expect(enc.senderKeyVersion).toBe(1);
    expect(enc.encryptedContent).not.toContain('hello');

    const dec = await decryptContent('conv1', { ...enc, isSystemPlaintext: false });
    expect(dec).toEqual({ text: 'hello e2ee', undecryptable: false });
  });

  it('renders SYSTEM plaintext without a CK', async () => {
    const dec = await decryptContent('conv-x', {
      encryptedContent: 'Your reset code is 123456',
      isSystemPlaintext: true,
    });
    expect(dec).toEqual({ text: 'Your reset code is 123456', undecryptable: false });
  });

  it('marks undecryptable when the CK is unavailable', async () => {
    // No CK primed and no identity/fetch available.
    const dec = await decryptContent('conv-missing', {
      encryptedContent: 'AAAA',
      iv: 'BBBB',
      senderKeyVersion: 1,
    });
    expect(dec.undecryptable).toBe(true);
  });

  it('AAD binds ciphertext to its conversation (cross-conversation splice fails)', async () => {
    const ck = generateCK();
    primeCK('convA', 1, ck);
    primeCK('convB', 1, ck); // same key bytes, different conversation id
    const enc = await encryptContent('convA', 1, 'secret');

    // Same CK bytes but decrypting under convB's AAD must fail the GCM tag.
    const dec = await decryptContent('convB', { ...enc });
    expect(dec.undecryptable).toBe(true);
  });

  it('AAD binds ciphertext to the key version', async () => {
    const ck = generateCK();
    primeCK('convC', 1, ck);
    primeCK('convC', 2, ck);
    const enc = await encryptContent('convC', 1, 'v1 message');
    const dec = await decryptContent('convC', { ...enc, senderKeyVersion: 2 });
    expect(dec.undecryptable).toBe(true);
  });
});
