import { describe, it, expect } from 'vitest';
import {
  createRegistrationMaterial,
  generateRecoveryCodeShares,
  recoveryVerifierFromInput,
  unwrapMkWithRecoveryCode,
  rewrapMasterKey,
  deriveLoginKey,
  unlockAccount,
} from '../accountKeys';

// Low iteration count in tests: correctness, not hardness.
const ITER = 1000;

const material = () =>
  createRegistrationMaterial({ username: 'alice', displayName: 'Alice', password: 'right-password', iterations: ITER });

describe('recovery flow A — wizard crypto round-trip', () => {
  it('a typed recovery code verifies against its stored verifier and unwraps the same MK', async () => {
    const m = await material();
    const display = m.recoveryCodesDisplay[0];
    const share = m.payload.recoveryCodes[0];

    // Step 1: the client-computed verifier matches what the server stored.
    const verifier = await recoveryVerifierFromInput(display);
    expect(verifier).toBe(share.verifierHash);

    // Step 2: the typed code unwraps the master key.
    const mk = await unwrapMkWithRecoveryCode(display, share.wrappedMk, share.wrapSalt);
    expect(mk).toEqual(m.mk);
  });

  it('a WRONG code fails to unwrap (GCM auth failure -> friendly "invalid code")', async () => {
    const m = await material();
    const share = m.payload.recoveryCodes[0];
    // A different valid-shaped code (from another share) must not open this wrap.
    const wrongDisplay = m.recoveryCodesDisplay[1];
    await expect(unwrapMkWithRecoveryCode(wrongDisplay, share.wrappedMk, share.wrapSalt)).rejects.toThrow();
  });

  it('rewrapMasterKey re-seals the same MK so the new password re-derives and unlocks', async () => {
    const m = await material();
    const share = m.payload.recoveryCodes[0];
    const mk = await unwrapMkWithRecoveryCode(m.recoveryCodesDisplay[0], share.wrappedMk, share.wrapSalt);

    // Step 3: re-wrap under a new password (what /recover/complete stores).
    const rewrapped = await rewrapMasterKey(mk, 'brand-new-password', ITER);
    expect(rewrapped.loginKey).toMatch(/^[0-9a-f]{64}$/);

    // A subsequent login with the new password re-derives the same loginKey and
    // unlocks the account (MK + identity secrets recovered — history preserved).
    const derived = await deriveLoginKey('brand-new-password', rewrapped.kekSalt, rewrapped.kekIterations);
    expect(derived.loginKeyHex).toBe(rewrapped.loginKey);
    const unlocked = await unlockAccount({
      kek: derived.kek,
      mkPasswordWrapped: rewrapped.mkPasswordWrapped,
      encryptedPrivateKeys: m.payload.encryptedPrivateKeys,
    });
    expect(unlocked.mk).toEqual(m.mk);
    expect(unlocked.identitySecret).toEqual(m.identitySecret);
  });

  it('the old password can no longer unlock after a re-wrap under a new salt', async () => {
    const m = await material();
    const rewrapped = await rewrapMasterKey(m.mk, 'brand-new-password', ITER);
    const oldDerived = await deriveLoginKey('right-password', rewrapped.kekSalt, rewrapped.kekIterations);
    await expect(
      unlockAccount({
        kek: oldDerived.kek,
        mkPasswordWrapped: rewrapped.mkPasswordWrapped,
        encryptedPrivateKeys: m.payload.encryptedPrivateKeys,
      }),
    ).rejects.toThrow();
  });
});

describe('recovery-code regeneration crypto', () => {
  it('generateRecoveryCodeShares yields 8 unique shares that each unwrap the same MK', async () => {
    const m = await material();
    const { recoveryCodes, recoveryCodesDisplay } = await generateRecoveryCodeShares(m.mk);

    expect(recoveryCodes).toHaveLength(8);
    expect(recoveryCodesDisplay).toHaveLength(8);
    expect(new Set(recoveryCodes.map((c) => c.verifierHash)).size).toBe(8);

    for (let i = 0; i < 8; i++) {
      const verifier = await recoveryVerifierFromInput(recoveryCodesDisplay[i]);
      expect(verifier).toBe(recoveryCodes[i].verifierHash);
      const mk = await unwrapMkWithRecoveryCode(
        recoveryCodesDisplay[i],
        recoveryCodes[i].wrappedMk,
        recoveryCodes[i].wrapSalt,
      );
      expect(mk).toEqual(m.mk);
    }

    // A regenerated set is disjoint from the registration set (old codes die).
    const original = new Set(m.payload.recoveryCodes.map((c) => c.verifierHash));
    for (const c of recoveryCodes) expect(original.has(c.verifierHash)).toBe(false);
  });
});
