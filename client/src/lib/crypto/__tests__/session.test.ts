import { describe, it, expect } from 'vitest';
import { generateIdentity, generateSignedPreKey, generatePreKeys } from '../keys';
import { establishSessionAsInitiator, establishSessionAsResponder, encrypt, decrypt } from '../session';

describe('session: end-to-end wire round-trip', () => {
  it('Alice -> Bob via published bundle and wire envelope', async () => {
    const alice = await generateIdentity();
    const bob = await generateIdentity();
    const bobSpk = await generateSignedPreKey(bob, 1);
    const bobOtk = (await generatePreKeys(1, 10))[0];

    // Alice establishes from Bob's public bundle
    const aliceSession = await establishSessionAsInitiator(alice, {
      identityDH: bob.dh.publicKey,
      signedPreKey: bobSpk.keyPair.publicKey,
      signedPreKeyId: bobSpk.id,
      oneTimePreKey: bobOtk.keyPair.publicKey,
      oneTimePreKeyId: bobOtk.id,
    });

    const wire = await encrypt(aliceSession, 'پیام محرمانه');
    // wire.encryptedContent must NOT contain the plaintext
    expect(wire.encryptedContent).not.toContain('پیام');
    expect(typeof wire.iv).toBe('string');
    expect(typeof wire.ephemeralKey).toBe('string');

    // Bob establishes responder session using the initial-message header in wire
    const bobSession = await establishSessionAsResponder(bob, bobSpk, bobOtk, wire);
    const plain = await decrypt(bobSession, wire);
    expect(plain).toBe('پیام محرمانه');
  });

  it('multi-message + out-of-order + bidirectional over the wire', async () => {
    const alice = await generateIdentity();
    const bob = await generateIdentity();
    const bobSpk = await generateSignedPreKey(bob, 1);
    const bobOtk = (await generatePreKeys(1, 20))[0];

    const aliceSession = await establishSessionAsInitiator(alice, {
      identityDH: bob.dh.publicKey,
      signedPreKey: bobSpk.keyPair.publicKey,
      signedPreKeyId: bobSpk.id,
      oneTimePreKey: bobOtk.keyPair.publicKey,
      oneTimePreKeyId: bobOtk.id,
    });

    const w1 = await encrypt(aliceSession, 'one');
    const bobSession = await establishSessionAsResponder(bob, bobSpk, bobOtk, w1);
    expect(await decrypt(bobSession, w1)).toBe('one');

    // out-of-order
    const w2 = await encrypt(aliceSession, 'two');
    const w3 = await encrypt(aliceSession, 'three');
    expect(await decrypt(bobSession, w3)).toBe('three');
    expect(await decrypt(bobSession, w2)).toBe('two');

    // reply (DH ratchet)
    const r1 = await encrypt(bobSession, 'reply 😀');
    expect(await decrypt(aliceSession, r1)).toBe('reply 😀');
  });
});
