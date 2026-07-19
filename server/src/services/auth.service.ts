import * as bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { config } from '../config';
import { generateTOTPSecret, verifyTOTP } from '../utils/totp';
import { redisClient } from '../utils/redis';
import { SessionService, SessionMeta } from './session.service';

const DEFAULT_KEK_ITERATIONS = 600000;

// Recovery flow A: single-use, 5-minute recovery token issued by /recover/verify
// and redeemed by /recover/complete (docs/ENCRYPTION.md).
const RECOVERY_TOKEN_TTL_SECONDS = 5 * 60;
const HEX64 = /^[0-9a-f]{64}$/i;

// Constant dummy hash so login runs a bcrypt compare even for unknown users —
// avoids a timing side-channel that would otherwise reveal account existence.
const DUMMY_HASH = bcrypt.hashSync('najva-nonexistent-account', 12);

interface RecoveryCodeInput {
  verifierHash: string;
  wrappedMk: string;
  wrapSalt: string;
}

/** A stored verifier hash as a fixed 32-byte buffer (never throws). */
const safeHex = (hex: string): Buffer => {
  try {
    const b = Buffer.from(hex, 'hex');
    return b.length === 32 ? b : Buffer.alloc(32);
  } catch {
    return Buffer.alloc(32);
  }
};

const publicUser = (u: { id: string; username: string; displayName: string | null; totpEnabled?: boolean }) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  totpEnabled: u.totpEnabled,
});

export class AuthService {
  static async register(data: any, meta: SessionMeta = {}) {
    const {
      username,
      displayName,
      loginKey,
      kekSalt,
      kekIterations,
      mkPasswordWrapped,
      encryptedPrivateKeys,
      identityKeyPublic,
      identitySigningPublic,
      recoveryCodes,
      savedMessagesKey,
    } = data ?? {};

    if (
      !username ||
      typeof loginKey !== 'string' ||
      !kekSalt ||
      !mkPasswordWrapped ||
      !encryptedPrivateKeys ||
      !identityKeyPublic ||
      !Array.isArray(recoveryCodes) ||
      recoveryCodes.length !== 8 ||
      !savedMessagesKey?.wrappedKey
    ) {
      throw new AppError('Invalid registration payload', 400);
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      throw new AppError('Username already exists', 400);
    }

    const passwordHash = await bcrypt.hash(loginKey, 12);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          displayName: displayName || username,
          passwordHash,
          kekSalt,
          kekIterations: typeof kekIterations === 'number' ? kekIterations : DEFAULT_KEK_ITERATIONS,
          mkPasswordWrapped,
          encryptedPrivateKeys,
          identityKeyPublic,
          identitySigningPublic: identitySigningPublic ?? null,
        },
      });

      await tx.recoveryCode.createMany({
        data: (recoveryCodes as RecoveryCodeInput[]).map((rc) => ({
          userId: created.id,
          verifierHash: rc.verifierHash,
          wrappedMk: rc.wrappedMk,
          wrapSalt: rc.wrapSalt,
        })),
      });

      const conversation = await tx.conversation.create({
        data: {
          type: 'SAVED_MESSAGES',
          name: 'Saved Messages',
          createdById: created.id,
          currentKeyVersion: 1,
          members: { create: { userId: created.id, role: 'ADMIN' } },
        },
      });

      await tx.conversationKey.create({
        data: {
          conversationId: conversation.id,
          userId: created.id,
          version: 1,
          wrappedKey: savedMessagesKey.wrappedKey,
          wrappedById: created.id,
        },
      });

      return created;
    });

    const { tokens, sessionId } = await SessionService.create(user.id, meta);
    return { user: publicUser(user), tokens, sessionId };
  }

  static async login(data: any, meta: SessionMeta = {}) {
    const { username, loginKey, totpCode } = data ?? {};
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.passwordHash || !user.kekSalt) {
      // Equalize timing with the success path before failing.
      await bcrypt.compare(typeof loginKey === 'string' ? loginKey : '', DUMMY_HASH);
      throw new AppError('Invalid credentials', 401);
    }

    const isMatch = await bcrypt.compare(typeof loginKey === 'string' ? loginKey : '', user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid credentials', 401);
    }

    if (user.isBlocked || user.isSuspended) {
      throw new AppError('Account is blocked or suspended', 403);
    }

    if (user.totpEnabled) {
      if (!totpCode) {
        return { requires2FA: true as const };
      }
      const isValid = verifyTOTP(user.totpSecret!, totpCode, user.username);
      if (!isValid) {
        throw new AppError('Invalid 2FA code', 401);
      }
    }

    const { tokens, sessionId } = await SessionService.create(user.id, meta);
    return {
      user: publicUser(user),
      tokens,
      sessionId,
      mkPasswordWrapped: user.mkPasswordWrapped,
      encryptedPrivateKeys: user.encryptedPrivateKeys,
      identityKeyPublic: user.identityKeyPublic,
      kekSalt: user.kekSalt,
      kekIterations: user.kekIterations,
    };
  }

  /**
   * KDF params for the login page. Unknown (or crypto-less) users get a
   * deterministic fake salt so responses can't be used to enumerate accounts.
   */
  static async getParams(username: string) {
    const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
    if (user && user.kekSalt) {
      return { kekSalt: user.kekSalt, kekIterations: user.kekIterations };
    }
    const mac = crypto.createHmac('sha256', config.serverSecret).update(username ?? '').digest();
    return { kekSalt: mac.subarray(0, 16).toString('base64'), kekIterations: DEFAULT_KEK_ITERATIONS };
  }

  /** Current wrapped MK + KDF params for the authed user (password change / regen). */
  static async getKeyMaterial(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mkPasswordWrapped || !user.kekSalt || !user.encryptedPrivateKeys) {
      throw new AppError('No key material', 404);
    }
    return {
      mkPasswordWrapped: user.mkPasswordWrapped,
      kekSalt: user.kekSalt,
      kekIterations: user.kekIterations,
      encryptedPrivateKeys: user.encryptedPrivateKeys,
    };
  }

  /**
   * Password change (docs/ENCRYPTION.md "Password change"). The client re-wraps
   * the SAME master key under a new KEK; here we verify the current loginKey and
   * atomically swap the credential + KDF params + wrapped MK, then revoke every
   * OTHER session (the caller's current session is spared). Recovery-code and
   * passkey wraps are untouched — they wrap the same MK.
   */
  static async changePassword(userId: string, currentSessionId: string | undefined, data: any) {
    const { currentLoginKey, newLoginKey, newKekSalt, newKekIterations, newMkPasswordWrapped } = data ?? {};
    if (
      typeof currentLoginKey !== 'string' ||
      typeof newLoginKey !== 'string' ||
      !newKekSalt ||
      !newMkPasswordWrapped
    ) {
      throw new AppError('Invalid password change payload', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new AppError('Invalid credentials', 401);
    }
    const ok = await bcrypt.compare(currentLoginKey, user.passwordHash);
    if (!ok) {
      throw new AppError('Invalid credentials', 401);
    }

    const passwordHash = await bcrypt.hash(newLoginKey, 12);
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        kekSalt: newKekSalt,
        kekIterations: typeof newKekIterations === 'number' ? newKekIterations : DEFAULT_KEK_ITERATIONS,
        mkPasswordWrapped: newMkPasswordWrapped,
      },
    });

    await SessionService.revokeAllForUser(userId, currentSessionId);
    return { success: true };
  }

  /**
   * Recovery flow A, step 1 (docs/ENCRYPTION.md). Timing-safe, user-scoped
   * verifier lookup: resolve the user by username, then compare the submitted
   * verifierHash against that user's UNUSED codes with crypto.timingSafeEqual —
   * no global verifierHash index lookup as the auth decision. Unknown username
   * and wrong code yield the same generic 401 and comparable timing.
   */
  static async recoverVerify(data: any) {
    const { username, verifierHash } = data ?? {};
    const submitted =
      typeof verifierHash === 'string' && HEX64.test(verifierHash) ? Buffer.from(verifierHash, 'hex') : null;

    const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
    const codes = user
      ? await prisma.recoveryCode.findMany({ where: { userId: user.id, usedAt: null } })
      : [];

    // Compare against every unused code with no early return. For an unknown
    // user (or a user with no codes), compare against random buffers so the work
    // and rough timing don't reveal whether the account exists.
    const rows: { id: string | null; stored: Buffer }[] =
      codes.length > 0
        ? codes.map((c) => ({ id: c.id, stored: safeHex(c.verifierHash) }))
        : Array.from({ length: 8 }, () => ({ id: null, stored: crypto.randomBytes(32) }));

    let matchedId: string | null = null;
    for (const row of rows) {
      const a = submitted && submitted.length === row.stored.length ? submitted : Buffer.alloc(row.stored.length);
      const equal = crypto.timingSafeEqual(a, row.stored);
      if (equal && row.id) matchedId = row.id;
    }

    if (!user || matchedId === null) {
      throw new AppError('Invalid recovery attempt', 401);
    }
    const matched = codes.find((c) => c.id === matchedId)!;

    const recoveryToken = crypto.randomBytes(32).toString('hex');
    await redisClient.set(
      `recover:${recoveryToken}`,
      JSON.stringify({ userId: user.id, codeId: matched.id }),
      'EX',
      RECOVERY_TOKEN_TTL_SECONDS,
    );

    return {
      wrappedMk: matched.wrappedMk,
      wrapSalt: matched.wrapSalt,
      encryptedPrivateKeys: user.encryptedPrivateKeys,
      recoveryToken,
    };
  }

  /**
   * Recovery flow A, step 3 (docs/ENCRYPTION.md). Redeems the single-use token,
   * atomically consumes the code + swaps password material, revokes ALL sessions,
   * disables TOTP (the code proves account ownership), then issues fresh tokens.
   */
  static async recoverComplete(data: any, meta: SessionMeta = {}) {
    const { recoveryToken, newLoginKey, kekSalt, kekIterations, mkPasswordWrapped } = data ?? {};
    if (typeof recoveryToken !== 'string' || typeof newLoginKey !== 'string' || !kekSalt || !mkPasswordWrapped) {
      throw new AppError('Invalid recovery payload', 400);
    }

    // Single-use: atomically fetch-and-delete the token.
    const raw = await redisClient.getdel(`recover:${recoveryToken}`);
    if (!raw) {
      throw new AppError('Invalid or expired recovery token', 401);
    }
    // Flow A tokens carry a `codeId` (the recovery code to consume); flow B
    // (passkey/PRF) tokens carry only `userId` — there is no code to mark used.
    let parsed: { userId: string; codeId?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError('Invalid or expired recovery token', 401);
    }

    const passwordHash = await bcrypt.hash(newLoginKey, 12);
    await prisma.$transaction(async (tx) => {
      if (parsed.codeId) {
        const used = await tx.recoveryCode.updateMany({
          where: { id: parsed.codeId, userId: parsed.userId, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (used.count === 0) {
          throw new AppError('Invalid or expired recovery token', 401);
        }
      }
      await tx.user.update({
        where: { id: parsed.userId },
        data: {
          passwordHash,
          kekSalt,
          kekIterations: typeof kekIterations === 'number' ? kekIterations : DEFAULT_KEK_ITERATIONS,
          mkPasswordWrapped,
          totpEnabled: false,
          totpSecret: null,
        },
      });
    });

    await SessionService.revokeAllForUser(parsed.userId);

    const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
    const { tokens } = await SessionService.create(parsed.userId, meta);
    return {
      success: true as const,
      user: publicUser(user!),
      tokens,
      mkPasswordWrapped: user!.mkPasswordWrapped,
      encryptedPrivateKeys: user!.encryptedPrivateKeys,
      kekSalt: user!.kekSalt,
      kekIterations: user!.kekIterations,
    };
  }

  /**
   * Regenerate recovery codes (authed). Requires the current password (loginKey)
   * and, when 2FA is enabled, a valid TOTP code. Replaces ALL RecoveryCode rows
   * with the client-generated set (8 codes wrapping the same MK) in one tx.
   */
  static async regenerateRecoveryCodes(userId: string, data: any) {
    const { loginKey, totpCode, recoveryCodes } = data ?? {};
    if (!Array.isArray(recoveryCodes) || recoveryCodes.length !== 8) {
      throw new AppError('Exactly 8 recovery codes are required', 400);
    }
    for (const rc of recoveryCodes as RecoveryCodeInput[]) {
      if (!rc?.verifierHash || !rc?.wrappedMk || !rc?.wrapSalt) {
        throw new AppError('Invalid recovery code payload', 400);
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new AppError('Invalid credentials', 401);
    }
    const ok = await bcrypt.compare(typeof loginKey === 'string' ? loginKey : '', user.passwordHash);
    if (!ok) {
      throw new AppError('Invalid credentials', 401);
    }
    if (user.totpEnabled) {
      if (!totpCode || !verifyTOTP(user.totpSecret!, totpCode, user.username)) {
        throw new AppError('Invalid 2FA code', 401);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.recoveryCode.createMany({
        data: (recoveryCodes as RecoveryCodeInput[]).map((rc) => ({
          userId,
          verifierHash: rc.verifierHash,
          wrappedMk: rc.wrappedMk,
          wrapSalt: rc.wrapSalt,
        })),
      });
    });

    return { success: true };
  }

  static async setup2FA(userId: string) {
    const secret = generateTOTPSecret();
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const otpauthUrl = `otpauth://totp/Najva%20Messenger:${user?.username}?secret=${secret}&issuer=Najva%20Messenger`;

    return { secret, otpauthUrl };
  }

  static async verify2FA(userId: string, code: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) {
      throw new AppError('2FA not setup', 400);
    }

    const isValid = verifyTOTP(user.totpSecret, code, user.username);
    if (!isValid) {
      throw new AppError('Invalid 2FA code', 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    return { success: true };
  }

  static async disable2FA(userId: string, code: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) {
      throw new AppError('2FA not setup', 400);
    }

    const isValid = verifyTOTP(user.totpSecret, code, user.username);
    if (!isValid) {
      throw new AppError('Invalid 2FA code', 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });

    return { success: true };
  }
}
