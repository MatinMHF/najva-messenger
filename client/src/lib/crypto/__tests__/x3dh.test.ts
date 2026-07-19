import { describe, it, expect } from 'vitest';
import { generateIdentity, generateSignedPreKey, generatePreKeys } from '../keys';
import { verify, generateDHKeyPair } from '../primitives';
import { x3dhInitiator, x3dhResponder } from '../x3dh';

const arr = (u: Uint8Array): number[] => Array.from(u);

describe('keys: identity + signed prekey', () => {
  it('identity has DH and signing keypairs', async () => {
    const id = await generateIdentity();
    expect(id.dh.publicKey.length).toBe(32);
    expect(id.signing.publicKey.length).toBe(32);
  });

  it('signed prekey signature verifies against identity signing key', async () => {
    const id = await generateIdentity();
    const spk = await generateSignedPreKey(id, 1);
    expect(verify(spk.keyPair.publicKey, spk.signature, id.signing.publicKey)).toBe(true);
  });

  it('generates N one-time prekeys with unique ids', async () => {
    const pks = await generatePreKeys(5, 100);
    expect(pks.length).toBe(5);
    expect(new Set(pks.map(p => p.id)).size).toBe(5);
  });
});

describe('x3dh: agreement', () => {
  it('initiator and responder derive identical shared secret', async () => {
    const alice = await generateIdentity();
    const bob = await generateIdentity();
    const bobSpk = await generateSignedPreKey(bob, 1);
    const bobOtk = (await generatePreKeys(1, 50))[0];

    // Alice uses an ephemeral key
    const aliceEph = generateDHKeyPair();

    const aliceSecret = await x3dhInitiator({
      identity: alice,
      ephemeral: aliceEph,
      remoteIdentityDH: bob.dh.publicKey,
      remoteSignedPreKey: bobSpk.keyPair.publicKey,
      remoteOneTimePreKey: bobOtk.keyPair.publicKey,
    });

    const bobSecret = await x3dhResponder({
      identity: bob,
      signedPreKey: bobSpk.keyPair,
      oneTimePreKey: bobOtk.keyPair,
      remoteIdentityDH: alice.dh.publicKey,
      remoteEphemeral: aliceEph.publicKey,
    });

    expect(arr(aliceSecret)).toEqual(arr(bobSecret));
    expect(aliceSecret.length).toBe(32);
  });
});
