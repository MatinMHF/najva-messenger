import { describe, it, expect } from 'vitest';
import { fingerprintWords, FINGERPRINT_WORDLIST } from '../fingerprint';
import { arrayBufferToBase64 } from '../utils';

const b64 = (bytes: number[]) => arrayBufferToBase64(new Uint8Array(bytes).buffer);

describe('flow-C key fingerprint', () => {
  it('has exactly 256 unique words', () => {
    expect(FINGERPRINT_WORDLIST).toHaveLength(256);
    expect(new Set(FINGERPRINT_WORDLIST).size).toBe(256);
  });

  it('is deterministic — the same key always yields the same words', async () => {
    const key = b64(Array.from({ length: 32 }, (_, i) => (i * 7) % 256));
    const a = await fingerprintWords(key);
    const b = await fingerprintWords(key);
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);
    a.forEach((w) => expect(FINGERPRINT_WORDLIST).toContain(w));
  });

  it('differs for different keys (MITM key-swap is visible)', async () => {
    const k1 = b64(Array.from({ length: 32 }, () => 1));
    const k2 = b64(Array.from({ length: 32 }, () => 2));
    expect(await fingerprintWords(k1)).not.toEqual(await fingerprintWords(k2));
  });
});
