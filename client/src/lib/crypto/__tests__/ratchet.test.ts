import { describe, it, expect } from 'vitest';
import {
  kdfChainKey,
  initRatchetInitiator, initRatchetResponder, ratchetEncrypt, ratchetDecrypt,
} from '../ratchet';
import { generateDHKeyPair } from '../primitives';

const arr = (u: Uint8Array): number[] => Array.from(u);

describe('ratchet: chain kdf', () => {
  it('advances chain key and yields message key deterministically', async () => {
    const ck = new Uint8Array(32).fill(1);
    const a = await kdfChainKey(ck);
    const b = await kdfChainKey(ck);
    // deterministic
    expect(arr(a.nextChainKey)).toEqual(arr(b.nextChainKey));
    expect(arr(a.messageKey)).toEqual(arr(b.messageKey));
    // chain key actually advances
    expect(arr(a.nextChainKey)).not.toEqual(arr(ck));
    // message key != chain key
    expect(arr(a.messageKey)).not.toEqual(arr(a.nextChainKey));
  });
});

describe('ratchet: full session', () => {
  async function pair() {
    const sk = new Uint8Array(32).fill(9);     // shared secret from X3DH
    const bob = generateDHKeyPair();           // Bob's ratchet (signed prekey) keypair
    const alice = initRatchetInitiator(sk, bob.publicKey);
    const bobState = initRatchetResponder(sk, bob);
    return { alice, bobState };
  }

  it('in-order round-trip', async () => {
    const { alice, bobState } = await pair();
    const m1 = await ratchetEncrypt(alice, 'سلام');
    const out1 = await ratchetDecrypt(bobState, m1);
    expect(out1).toBe('سلام');
    const m2 = await ratchetEncrypt(alice, 'how are you');
    expect(await ratchetDecrypt(bobState, m2)).toBe('how are you');
  });

  it('out-of-order delivery via skipped keys', async () => {
    const { alice, bobState } = await pair();
    const m1 = await ratchetEncrypt(alice, 'first');
    const m2 = await ratchetEncrypt(alice, 'second');
    // deliver m2 before m1
    expect(await ratchetDecrypt(bobState, m2)).toBe('second');
    expect(await ratchetDecrypt(bobState, m1)).toBe('first');
  });

  it('bidirectional with DH ratchet step', async () => {
    const { alice, bobState } = await pair();
    const a1 = await ratchetEncrypt(alice, 'ping');
    expect(await ratchetDecrypt(bobState, a1)).toBe('ping');
    const b1 = await ratchetEncrypt(bobState, 'pong');
    expect(await ratchetDecrypt(alice, b1)).toBe('pong');
  });
});
