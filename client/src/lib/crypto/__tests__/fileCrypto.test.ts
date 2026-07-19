import { describe, it, expect, beforeEach } from 'vitest';
import { encryptBytes, decryptBytes, encryptAttachment, decryptAttachment } from '../fileCrypto';
import { generateCK, primeCK, clearCKCache } from '../conversationKeys';

beforeEach(() => clearCKCache());

const bytes = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

describe('file encryption', () => {
  it('round-trips file bytes under a CK-wrapped FK', async () => {
    const ck = generateCK();
    const data = bytes('the quick brown fox 🦊');
    const { blob, encryptedKey } = await encryptBytes(ck, data);

    // Blob is ciphertext (iv is 12 bytes; total larger than plaintext by iv+tag).
    expect(blob.length).toBeGreaterThan(data.length);
    expect(str(await decryptBytes(ck, encryptedKey, blob))).toBe('the quick brown fox 🦊');
  });

  it('fails to decrypt with the wrong CK', async () => {
    const ck = generateCK();
    const { blob, encryptedKey } = await encryptBytes(ck, bytes('secret'));
    await expect(decryptBytes(generateCK(), encryptedKey, blob)).rejects.toThrow();
  });

  it('encryptAttachment shares one FK across file + thumbnail and round-trips via the cache', async () => {
    primeCK('conv1', 1, generateCK());
    const file = bytes('FULL IMAGE BYTES');
    const thumb = bytes('tiny thumb');
    const { blob, thumbnailBlob, encryptedKey } = await encryptAttachment('conv1', 1, file, thumb);

    expect(thumbnailBlob).toBeTruthy();
    expect(str(await decryptAttachment('conv1', 1, encryptedKey, blob))).toBe('FULL IMAGE BYTES');
    expect(str(await decryptAttachment('conv1', 1, encryptedKey, thumbnailBlob!))).toBe('tiny thumb');
  });
});
