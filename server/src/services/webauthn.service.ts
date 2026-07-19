import crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { prisma } from '../utils/prisma';
import { redisClient } from '../utils/redis';
import { AppError } from '../utils/errors';
import { config } from '../config';
import { SessionService, SessionMeta } from './session.service';

// One-time, short-lived challenges (docs/ENCRYPTION.md: "Challenge storage in
// Redis (short TTL, one-time)"). Consumed with GETDEL so a challenge can never
// be replayed.
const CHALLENGE_TTL_SECONDS = 5 * 60;
const PRF_SALT_BYTES = 32;
// Recovery flow B reuses flow A's single-use token + /auth/recover/complete.
const RECOVERY_TOKEN_TTL_SECONDS = 5 * 60;

const rpID = () => config.webauthnRpId;
const rpOrigin = () => config.webauthnOrigin;

const parseTransports = (json: string | null): AuthenticatorTransportFuture[] | undefined => {
  if (!json) return undefined;
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as AuthenticatorTransportFuture[]) : undefined;
  } catch {
    return undefined;
  }
};

const publicUser = (u: { id: string; username: string; displayName: string | null; totpEnabled?: boolean }) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  totpEnabled: u.totpEnabled,
});

export class WebAuthnService {
  // ---- Registration (authed) --------------------------------------------

  /**
   * Build a passkey-creation options object for the authed user. A fresh 32-byte
   * PRF eval salt is generated per registration and returned so the client can
   * request the `prf` extension (create or a deferred get()). Both the challenge
   * and the salt are stashed in Redis (one-time) and re-associated at verify.
   */
  static async registrationOptions(userId: string, username: string) {
    const existing = await prisma.webAuthnCredential.findMany({ where: { userId } });
    const options = await generateRegistrationOptions({
      rpName: config.webauthnRpName,
      rpID: rpID(),
      userName: username,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: parseTransports(c.transports),
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const prfSalt = crypto.randomBytes(PRF_SALT_BYTES).toString('base64');
    await redisClient.set(
      `webauthn:reg:${userId}`,
      JSON.stringify({ challenge: options.challenge, prfSalt }),
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
    return { options, prfSalt };
  }

  /**
   * Verify a registration ceremony and persist the credential. If the client
   * already harvested a PRF output during create() it sends `wrappedMk` and the
   * credential is stored PRF-capable; otherwise it is stored `prfSupported:false`
   * with its prfSalt so a deferred harvest can upgrade it later (Safari path).
   */
  static async registrationVerify(userId: string, data: any) {
    const { response, deviceName, wrappedMk } = data ?? {};
    if (!response || typeof response !== 'object') {
      throw new AppError('Missing registration response', 400);
    }

    const raw = await redisClient.getdel(`webauthn:reg:${userId}`);
    if (!raw) throw new AppError('Registration challenge expired', 400);
    let stash: { challenge: string; prfSalt: string };
    try {
      stash = JSON.parse(raw);
    } catch {
      throw new AppError('Registration challenge expired', 400);
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: stash.challenge,
        expectedOrigin: rpOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: false,
      });
    } catch {
      throw new AppError('Passkey registration failed', 400);
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new AppError('Passkey registration failed', 400);
    }

    const { credential } = verification.registrationInfo;
    const prfSupported = typeof wrappedMk === 'string' && wrappedMk.length > 0;

    await prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: BigInt(credential.counter),
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
        deviceName: typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim().slice(0, 64) : null,
        prfSupported,
        prfSalt: stash.prfSalt,
        wrappedMk: prfSupported ? (wrappedMk as string) : null,
      },
    });

    return { credentialId: credential.id, prfSalt: stash.prfSalt, prfSupported };
  }

  /**
   * Deferred PRF harvest (Safari / any authenticator that only exposes PRF on
   * get()). The client evaluated the credential's PRF with its stored prfSalt,
   * derived PWK, wrapped the MK, and uploads it here — upgrading the credential
   * to PRF-capable so it can drive recovery flow B.
   */
  static async setCredentialPrf(userId: string, data: any) {
    const { credentialId, wrappedMk } = data ?? {};
    if (typeof credentialId !== 'string' || typeof wrappedMk !== 'string' || !wrappedMk) {
      throw new AppError('Invalid PRF payload', 400);
    }
    const cred = await prisma.webAuthnCredential.findFirst({ where: { credentialId, userId } });
    if (!cred) throw new AppError('Credential not found', 404);
    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { prfSupported: true, wrappedMk },
    });
    return { success: true as const };
  }

  // ---- Authentication (login / recover — unauthed, discoverable) ---------

  private static async authOptions(prefix: string) {
    const options = await generateAuthenticationOptions({
      rpID: rpID(),
      userVerification: 'preferred',
    });
    const challengeId = crypto.randomBytes(16).toString('hex');
    await redisClient.set(`webauthn:${prefix}:${challengeId}`, options.challenge, 'EX', CHALLENGE_TTL_SECONDS);
    return { options, challengeId };
  }

  /**
   * Verify a discoverable-credential assertion. Resolves the credential (and its
   * owner) by the response id, checks the ceremony, and rejects a counter
   * regression (cloned-authenticator signal). Returns the verified credential
   * row + user; callers decide what to do next (issue session vs. recover).
   */
  private static async assertCredential(prefix: string, data: any) {
    const { challengeId, response } = data ?? {};
    if (typeof challengeId !== 'string' || !response || typeof response !== 'object') {
      throw new AppError('Invalid assertion payload', 400);
    }
    const challenge = await redisClient.getdel(`webauthn:${prefix}:${challengeId}`);
    if (!challenge) throw new AppError('Login challenge expired', 400);

    const credentialId = typeof (response as any).id === 'string' ? (response as any).id : '';
    const cred = await prisma.webAuthnCredential.findUnique({
      where: { credentialId },
      include: { user: true },
    });
    if (!cred) throw new AppError('Passkey not recognized', 401);

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: rpOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: false,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64')),
          counter: Number(cred.counter),
          transports: parseTransports(cred.transports),
        },
      });
    } catch {
      throw new AppError('Passkey verification failed', 401);
    }
    if (!verification.verified) throw new AppError('Passkey verification failed', 401);

    // Counter regression: a non-zero stored counter that the authenticator did
    // not advance signals a cloned credential. Reject and leave the row intact.
    const newCounter = BigInt(verification.authenticationInfo.newCounter);
    if (cred.counter > 0n && newCounter <= cred.counter) {
      throw new AppError('Passkey counter regression detected', 401);
    }

    return { cred, newCounter };
  }

  static loginOptions() {
    return WebAuthnService.authOptions('login');
  }

  /** Discoverable passkey login → same session/tokens as a password login. */
  static async loginVerify(data: any, meta: SessionMeta = {}) {
    const { cred, newCounter } = await WebAuthnService.assertCredential('login', data);
    const user = cred.user;
    if (user.isBlocked || user.isSuspended) {
      throw new AppError('Account is blocked or suspended', 403);
    }

    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { counter: newCounter, lastUsedAt: new Date() },
    });

    const { tokens } = await SessionService.create(user.id, meta);
    return {
      user: publicUser(user),
      tokens,
      // Material the client needs to unlock the MK after a passkey login.
      // PRF-capable: client re-evaluates PRF (with prfSalt) to unwrap wrappedMk.
      // Non-PRF: MK stays locked until the user supplies their password.
      prfSupported: cred.prfSupported,
      prfSalt: cred.prfSalt,
      wrappedMk: cred.wrappedMk,
      mkPasswordWrapped: user.mkPasswordWrapped,
      encryptedPrivateKeys: user.encryptedPrivateKeys,
      identityKeyPublic: user.identityKeyPublic,
      kekSalt: user.kekSalt,
      kekIterations: user.kekIterations,
    };
  }

  static recoverOptions() {
    return WebAuthnService.authOptions('recover');
  }

  /**
   * Recovery flow B (docs/ENCRYPTION.md). A discoverable-credential assertion
   * that ONLY succeeds for PRF-capable credentials (they alone hold a wrappedMk
   * that a fresh, password-less device can unwrap). Issues the same single-use
   * recovery token as flow A so completion reuses `/auth/recover/complete`.
   */
  static async recoverVerify(data: any) {
    const { cred, newCounter } = await WebAuthnService.assertCredential('recover', data);
    if (!cred.prfSupported || !cred.wrappedMk || !cred.prfSalt) {
      // A non-PRF passkey signs you in but cannot recover message history.
      throw new AppError('This passkey cannot recover your account', 400);
    }

    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { counter: newCounter, lastUsedAt: new Date() },
    });

    const recoveryToken = crypto.randomBytes(32).toString('hex');
    await redisClient.set(
      `recover:${recoveryToken}`,
      JSON.stringify({ userId: cred.userId }),
      'EX',
      RECOVERY_TOKEN_TTL_SECONDS,
    );

    return {
      wrappedMk: cred.wrappedMk,
      prfSalt: cred.prfSalt,
      encryptedPrivateKeys: cred.user.encryptedPrivateKeys,
      recoveryToken,
    };
  }

  // ---- Credential management (authed) -----------------------------------

  static async listCredentials(userId: string) {
    const creds = await prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return creds.map((c) => ({
      id: c.id,
      deviceName: c.deviceName,
      prfSupported: c.prfSupported,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    }));
  }

  static async renameCredential(userId: string, id: string, deviceName: unknown) {
    if (typeof deviceName !== 'string' || !deviceName.trim()) {
      throw new AppError('A name is required', 400);
    }
    const cred = await prisma.webAuthnCredential.findFirst({ where: { id, userId } });
    if (!cred) throw new AppError('Credential not found', 404);
    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { deviceName: deviceName.trim().slice(0, 64) },
    });
    return { success: true as const };
  }

  /** Delete a passkey. Requires the current password (loginKey) as confirmation. */
  static async deleteCredential(userId: string, id: string, data: any) {
    const { loginKey } = data ?? {};
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new AppError('Invalid credentials', 401);
    const ok = await bcrypt.compare(typeof loginKey === 'string' ? loginKey : '', user.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);

    const cred = await prisma.webAuthnCredential.findFirst({ where: { id, userId } });
    if (!cred) throw new AppError('Credential not found', 404);
    await prisma.webAuthnCredential.delete({ where: { id: cred.id } });
    return { success: true as const };
  }
}
