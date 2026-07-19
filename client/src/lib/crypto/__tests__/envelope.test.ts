import { describe, it, expect } from 'vitest';
import { wrapBytes, unwrapBytes, sealEnvelope, openEnvelope } from '../envelope';
import { generateDHKeyPair, randomBytes } from '../primitives';

describe('AEAD envelope (wrapBytes / unwrapBytes)', () => {
  it('round-trips and is a versioned JSON string', async () => {
    const key = randomBytes(32);
    const mk = randomBytes(32);
    const env = await wrapBytes(key, mk, 'najva:mk:v1');
    const parsed = JSON.parse(env);
    expect(parsed.v).toBe(1);
    expect(parsed.alg).toBe('A256GCM');
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ct).toBe('string');
    expect(await unwrapBytes(key, env, 'najva:mk:v1')).toEqual(mk);
  });

  it('fails with the wrong key (GCM tag)', async () => {
    const env = await wrapBytes(randomBytes(32), randomBytes(32));
    await expect(unwrapBytes(randomBytes(32), env)).rejects.toThrow();
  });

  it('fails with the wrong AAD', async () => {
    const key = randomBytes(32);
    const env = await wrapBytes(key, randomBytes(32), 'context-a');
    await expect(unwrapBytes(key, env, 'context-b')).rejects.toThrow();
  });

  it('rejects unknown envelope versions/algorithms', async () => {
    const key = randomBytes(32);
    await expect(unwrapBytes(key, JSON.stringify({ v: 9, alg: 'A256GCM', iv: '', ct: '' }))).rejects.toThrow();
    await expect(unwrapBytes(key, JSON.stringify({ v: 1, alg: 'ROT13', iv: '', ct: '' }))).rejects.toThrow();
  });
});

describe('sealed envelope (sealEnvelope / openEnvelope)', () => {
  it('round-trips via recipient keypair', () => {
    const recipient = generateDHKeyPair();
    const ck = randomBytes(32);
    const env = sealEnvelope(recipient.publicKey, ck);
    const parsed = JSON.parse(env);
    expect(parsed.v).toBe(1);
    expect(parsed.alg).toBe('sealbox');
    expect(openEnvelope(recipient.secretKey, env)).toEqual(ck);
  });

  it('rejects wrong recipient', () => {
    const recipient = generateDHKeyPair();
    const other = generateDHKeyPair();
    const env = sealEnvelope(recipient.publicKey, randomBytes(32));
    expect(() => openEnvelope(other.secretKey, env)).toThrow();
  });
});
