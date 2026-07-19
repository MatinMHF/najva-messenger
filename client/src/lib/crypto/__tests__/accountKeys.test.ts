import { describe, it, expect } from 'vitest';
import {
  createRegistrationMaterial,
  deriveLoginKey,
  unlockAccount,
} from '../accountKeys';
import { openEnvelope } from '../envelope';

// Low iteration count in tests: correctness, not hardness.
const ITER = 1000;

describe('createRegistrationMaterial', () => {
  it('produces a complete, well-shaped registration payload', async () => {
    const m = await createRegistrationMaterial({
      username: 'alice',
      displayName: 'Alice',
      password: 'correct horse battery staple',
      iterations: ITER,
    });

    expect(m.payload.username).toBe('alice');
    expect(m.payload.displayName).toBe('Alice');
    expect(m.payload.kekIterations).toBe(ITER);
    // loginKey is 32 bytes of hex — the server never sees the password
    expect(m.payload.loginKey).toMatch(/^[0-9a-f]{64}$/);
    // kekSalt / identity public are base64
    expect(m.payload.kekSalt).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(m.payload.identityKeyPublic).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(m.payload.identitySigningPublic).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // wrapped blobs are JSON envelopes
    expect(JSON.parse(m.payload.mkPasswordWrapped).alg).toBe('A256GCM');
    expect(JSON.parse(m.payload.encryptedPrivateKeys).alg).toBe('A256GCM');
    expect(JSON.parse(m.payload.savedMessagesKey.wrappedKey).alg).toBe('sealbox');

    // 8 recovery codes, each a hashed verifier + wrapped MK + salt triple
    expect(m.payload.recoveryCodes).toHaveLength(8);
    expect(m.recoveryCodesDisplay).toHaveLength(8);
    for (const rc of m.payload.recoveryCodes) {
      expect(rc.verifierHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.parse(rc.wrappedMk).alg).toBe('A256GCM');
      expect(rc.wrapSalt).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
    // verifier hashes are unique across codes
    const hashes = new Set(m.payload.recoveryCodes.map((c) => c.verifierHash));
    expect(hashes.size).toBe(8);

    // never leaks a raw code in the server-bound payload
    for (const display of m.recoveryCodesDisplay) {
      expect(m.payload.mkPasswordWrapped).not.toContain(display);
    }

    expect(m.mk).toHaveLength(32);
  });
});

describe('login unwrap round-trip', () => {
  it('re-derives the same loginKey and unwraps the master key + identity secrets', async () => {
    const password = 'hunter2-hunter2';
    const m = await createRegistrationMaterial({
      username: 'bob',
      displayName: 'Bob',
      password,
      iterations: ITER,
    });

    // Server hands the client kekSalt + iterations via /auth/params.
    const derived = await deriveLoginKey(password, m.payload.kekSalt, m.payload.kekIterations);
    expect(derived.loginKeyHex).toBe(m.payload.loginKey);

    const unlocked = await unlockAccount({
      kek: derived.kek,
      mkPasswordWrapped: m.payload.mkPasswordWrapped,
      encryptedPrivateKeys: m.payload.encryptedPrivateKeys,
    });
    expect(unlocked.mk).toEqual(m.mk);
    expect(unlocked.identitySecret).toEqual(m.identitySecret);
    expect(unlocked.signingSecret).toEqual(m.signingSecret);
  });

  it('the SAVED_MESSAGES conversation key is sealed to the account identity key', async () => {
    const m = await createRegistrationMaterial({
      username: 'carol',
      displayName: 'Carol',
      password: 'pw',
      iterations: ITER,
    });
    const ck = openEnvelope(m.identitySecret, m.payload.savedMessagesKey.wrappedKey);
    expect(ck).toEqual(m.savedMessagesCK);
  });

  it('a wrong password cannot unwrap the master key (GCM auth failure)', async () => {
    const m = await createRegistrationMaterial({
      username: 'dave',
      displayName: 'Dave',
      password: 'right-password',
      iterations: ITER,
    });
    const wrong = await deriveLoginKey('wrong-password', m.payload.kekSalt, m.payload.kekIterations);
    expect(wrong.loginKeyHex).not.toBe(m.payload.loginKey);
    await expect(
      unlockAccount({
        kek: wrong.kek,
        mkPasswordWrapped: m.payload.mkPasswordWrapped,
        encryptedPrivateKeys: m.payload.encryptedPrivateKeys,
      }),
    ).rejects.toThrow();
  });
});
