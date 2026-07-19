import crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { redisClient } from '../utils/redis';
import { AppError } from '../utils/errors';
import { SessionService, SessionMeta } from './session.service';
import { ConversationService } from './conversation.service';
import { emitToUser, emitToConversation, getIoInstance } from '../socket/emitter';

const DEFAULT_KEK_ITERATIONS = 600000;
// Flow C handshake window (docs/ENCRYPTION.md): 10-minute Redis TTL, one active
// request per user.
const RESET_TTL_SECONDS = 10 * 60;
// Flow D admin authorization token: one-time, 24-hour.
const LOST_TOKEN_TTL_SECONDS = 24 * 60 * 60;
// Hard cap on OTP guesses per reset (Phase-1 security obligation).
const MAX_OTP_ATTEMPTS = 5;

type ResetStatus = 'PENDING' | 'APPROVED';

interface ResetState {
  userId: string;
  ephemeralPub: string;
  otpHash: string;
  resetSecret: string;
  status: ResetStatus;
  sealedMk?: string;
  attempts: number;
  deviceInfo: { userAgent: string | null; ip: string | null };
}

const resetKey = (resetId: string) => `reset:${resetId}`;
const userActiveKey = (userId: string) => `reset:user:${userId}`;
const lostKey = (token: string) => `reset_lost:${token}`;

const sha256hex = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** Constant-time hex compare that never throws on malformed input. */
const timingEqualHex = (a: unknown, b: string): boolean => {
  if (typeof a !== 'string') return false;
  let ba: Buffer;
  let bb: Buffer;
  try {
    ba = Buffer.from(a, 'hex');
    bb = Buffer.from(b, 'hex');
  } catch {
    return false;
  }
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const loadState = async (resetId: string): Promise<ResetState | null> => {
  if (typeof resetId !== 'string' || !resetId) return null;
  const raw = await redisClient.get(resetKey(resetId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ResetState;
  } catch {
    return null;
  }
};

/** Persist mutated state without extending its original expiry. */
const saveState = async (resetId: string, state: ResetState): Promise<void> => {
  const ttl = await redisClient.ttl(resetKey(resetId));
  await redisClient.set(resetKey(resetId), JSON.stringify(state), 'EX', ttl > 0 ? ttl : 1);
};

const clearReset = async (resetId: string, userId: string): Promise<void> => {
  await redisClient.del(resetKey(resetId));
  await redisClient.del(userActiveKey(userId));
};

const isBase64Key = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 128 && /^[A-Za-z0-9+/=]+$/.test(v);

/** The support bot that delivers plaintext SYSTEM messages (OTP delivery). */
const getSupportBot = async () => {
  let bot = await prisma.user.findUnique({ where: { username: 'najva-support' } });
  if (!bot) {
    bot = await prisma.user.create({
      data: {
        username: 'najva-support',
        displayName: 'Najva Support',
        passwordHash: crypto.randomBytes(16).toString('hex'),
      },
    });
  }
  return bot;
};

/** Deliver the 6-digit OTP to the user's live device(s) via the support DM. */
const deliverOtp = async (userId: string, language: string | null, otp: string): Promise<void> => {
  const bot = await getSupportBot();
  const conv = await ConversationService.getOrCreateSystemDM(bot.id, userId);
  await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
  await prisma.conversationMember.updateMany({
    where: { conversationId: conv.id, userId: { in: [userId, bot.id] } },
    data: { isRemoved: false, isHidden: false },
  });

  const text =
    language === 'fa'
      ? `کد تایید بازیابی رمز عبور شما: ${otp}`
      : `Your password reset code is: ${otp}`;

  const message = await prisma.message.create({
    data: {
      type: 'SYSTEM',
      encryptedContent: text,
      isSystemPlaintext: true,
      conversationId: conv.id,
      senderId: bot.id,
    },
    include: { sender: { select: { id: true, username: true, displayName: true } } },
  });

  const io = getIoInstance();
  if (io) {
    const payload = { message, conversationId: conv.id };
    io.to(`user:${userId}`).emit('message:new', payload);
    io.to(`conv:${conv.id}`).emit('message:new', payload);
  }
};

export class ResetService {
  // ---- Flow C: support-OTP handshake to a logged-in device ----------------

  /**
   * Device B (logged out) starts a reset with its ephemeral X25519 public key.
   * We stash a PENDING handshake in Redis (10-min, one active per user), deliver
   * a 6-digit OTP to device A as a plaintext SYSTEM message, and push a
   * `reset:pending` socket event so A can render the approval prompt. Returns a
   * `resetSecret` that only device B holds — required to poll and complete.
   */
  static async request(data: any, meta: SessionMeta = {}) {
    const { username, ephemeralPub } = data ?? {};
    if (typeof username !== 'string' || !username || !isBase64Key(ephemeralPub)) {
      throw new AppError('Username and ephemeral key are required', 400);
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new AppError('No account found with that username', 404);
    }

    // One active request per user — supersede any earlier one.
    const prior = await redisClient.get(userActiveKey(user.id));
    if (prior) await redisClient.del(resetKey(prior));

    const resetId = crypto.randomBytes(16).toString('hex');
    const resetSecret = crypto.randomBytes(32).toString('hex');
    const otp = crypto.randomInt(100000, 1000000).toString();

    const state: ResetState = {
      userId: user.id,
      ephemeralPub,
      otpHash: sha256hex(otp),
      resetSecret,
      status: 'PENDING',
      attempts: 0,
      deviceInfo: { userAgent: meta.userAgent ?? null, ip: meta.ip ?? null },
    };
    await redisClient.set(resetKey(resetId), JSON.stringify(state), 'EX', RESET_TTL_SECONDS);
    await redisClient.set(userActiveKey(user.id), resetId, 'EX', RESET_TTL_SECONDS);

    await deliverOtp(user.id, user.language, otp);

    // Device A computes the fingerprint from ephemeralPub itself (do NOT trust a
    // server-computed one — that's the whole point of the MITM check).
    emitToUser(user.id, 'reset:pending', {
      resetId,
      ephemeralPub,
      deviceInfo: state.deviceInfo,
    });

    return { resetId, resetSecret };
  }

  /**
   * Device A approves the handshake, uploading its master key sealed to device
   * B's ephemeral public key. Authenticated — only the account's own live device
   * can approve.
   */
  static async approve(userId: string, data: any) {
    const { resetId, sealedMk } = data ?? {};
    if (typeof sealedMk !== 'string' || !sealedMk) {
      throw new AppError('Sealed key material is required', 400);
    }
    const state = await loadState(resetId);
    if (!state || state.userId !== userId) {
      throw new AppError('Reset request not found', 404);
    }
    if (state.status !== 'PENDING') {
      throw new AppError('Reset request is not pending', 409);
    }
    state.status = 'APPROVED';
    state.sealedMk = sealedMk;
    await saveState(resetId, state);
    return { success: true as const };
  }

  /** Device A denies the handshake — kills the reset immediately. */
  static async deny(userId: string, data: any) {
    const { resetId } = data ?? {};
    const state = await loadState(resetId);
    if (state && state.userId === userId) {
      await clearReset(resetId, userId);
    }
    return { success: true as const };
  }

  /** Device B polls the handshake status (resetSecret-gated). */
  static async status(resetId: string, secret: unknown) {
    const state = await loadState(resetId);
    if (!state) throw new AppError('Reset request not found', 404);
    if (!timingEqualHex(secret, state.resetSecret)) {
      throw new AppError('Invalid reset secret', 403);
    }
    return {
      status: state.status,
      sealedMk: state.status === 'APPROVED' ? state.sealedMk : undefined,
      ephemeralPub: state.ephemeralPub,
    };
  }

  /**
   * Device B completes: proves the OTP (hashed, constant-time, ≤5 attempts) and
   * the resetSecret, then swaps ONLY the password material (the MK is unchanged —
   * B unwrapped the real one from the sealed blob and re-wrapped it), revokes all
   * sessions, and issues fresh tokens. Recovery codes + TOTP are left intact.
   */
  static async complete(data: any, meta: SessionMeta = {}) {
    const { resetId, resetSecret, otp, newLoginKey, kekSalt, kekIterations, mkPasswordWrapped } = data ?? {};
    if (typeof newLoginKey !== 'string' || !kekSalt || !mkPasswordWrapped) {
      throw new AppError('Invalid reset payload', 400);
    }
    const state = await loadState(resetId);
    if (!state) throw new AppError('Invalid or expired reset', 401);
    if (!timingEqualHex(resetSecret, state.resetSecret)) {
      throw new AppError('Invalid or expired reset', 401);
    }
    if (state.status !== 'APPROVED' || !state.sealedMk) {
      throw new AppError('Reset has not been approved yet', 409);
    }

    const otpOk = typeof otp === 'string' && timingEqualHex(sha256hex(otp), state.otpHash);
    if (!otpOk) {
      state.attempts += 1;
      if (state.attempts >= MAX_OTP_ATTEMPTS) {
        await clearReset(resetId, state.userId);
        throw new AppError('Too many incorrect codes. Start the reset again.', 429);
      }
      await saveState(resetId, state);
      throw new AppError('Incorrect verification code', 401);
    }

    const passwordHash = await bcrypt.hash(newLoginKey, 12);
    await prisma.user.update({
      where: { id: state.userId },
      data: {
        passwordHash,
        kekSalt,
        kekIterations: typeof kekIterations === 'number' ? kekIterations : DEFAULT_KEK_ITERATIONS,
        mkPasswordWrapped,
      },
    });

    await clearReset(resetId, state.userId);
    await SessionService.revokeAllForUser(state.userId);

    const user = await prisma.user.findUnique({ where: { id: state.userId } });
    const { tokens } = await SessionService.create(state.userId, meta);
    return {
      success: true as const,
      user: { id: user!.id, username: user!.username, displayName: user!.displayName, totpEnabled: user!.totpEnabled },
      tokens,
      mkPasswordWrapped: user!.mkPasswordWrapped,
      encryptedPrivateKeys: user!.encryptedPrivateKeys,
      identityKeyPublic: user!.identityKeyPublic,
      kekSalt: user!.kekSalt,
      kekIterations: user!.kekIterations,
    };
  }

  // ---- Flow D: admin-gated cryptographic-loss reset -----------------------

  /**
   * Admin issues a one-time, 24-hour authorization token for a specific user
   * after verifying identity out-of-band. Surfaced to the user via support chat.
   */
  static async authorizeReset(targetUserId: string) {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new AppError('User not found', 404);
    const token = crypto.randomBytes(32).toString('hex');
    await redisClient.set(lostKey(token), JSON.stringify({ userId: targetUserId }), 'EX', LOST_TOKEN_TTL_SECONDS);
    return { token, expiresInHours: 24 };
  }

  /**
   * Complete a cryptographic-loss reset: replace ALL of the user's key material
   * with a brand-new identity, then wipe everything that wrapped the OLD master
   * key (recovery codes, passkey MK blobs, the user's ConversationKey rows) and
   * bump `mkVersion`. Old messages become permanently unreadable — surfaced in
   * the UI. Emits `conversation:member_key_reset` so other members' clients can
   * re-seal the current conversation key to the new identity (Phase 4).
   */
  static async completeLost(data: any, meta: SessionMeta = {}) {
    const {
      authorizationToken,
      username,
      loginKey,
      kekSalt,
      kekIterations,
      mkPasswordWrapped,
      encryptedPrivateKeys,
      identityKeyPublic,
      identitySigningPublic,
      recoveryCodes,
    } = data ?? {};

    if (
      typeof authorizationToken !== 'string' ||
      typeof loginKey !== 'string' ||
      !kekSalt ||
      !mkPasswordWrapped ||
      !encryptedPrivateKeys ||
      !identityKeyPublic ||
      !Array.isArray(recoveryCodes) ||
      recoveryCodes.length !== 8
    ) {
      throw new AppError('Invalid reset payload', 400);
    }
    for (const rc of recoveryCodes) {
      if (!rc?.verifierHash || !rc?.wrappedMk || !rc?.wrapSalt) {
        throw new AppError('Invalid recovery code payload', 400);
      }
    }

    // Single-use: fetch-and-delete the authorization token.
    const raw = await redisClient.getdel(lostKey(authorizationToken));
    if (!raw) throw new AppError('Invalid or expired authorization token', 401);
    let parsed: { userId: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError('Invalid or expired authorization token', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
    if (!user || (typeof username === 'string' && username && user.username !== username)) {
      throw new AppError('Invalid or expired authorization token', 401);
    }

    const passwordHash = await bcrypt.hash(loginKey, 12);
    const memberships = await prisma.conversationMember.findMany({
      where: { userId: user.id },
      select: { conversationId: true },
    });
    const conversationIds = memberships.map((m) => m.conversationId);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          kekSalt,
          kekIterations: typeof kekIterations === 'number' ? kekIterations : DEFAULT_KEK_ITERATIONS,
          mkPasswordWrapped,
          encryptedPrivateKeys,
          identityKeyPublic,
          identitySigningPublic: identitySigningPublic ?? null,
          totpEnabled: false,
          totpSecret: null,
          mkVersion: { increment: 1 },
        },
      });
      // Everything that wrapped the OLD MK is now useless — wipe it.
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.recoveryCode.createMany({
        data: recoveryCodes.map((rc: any) => ({
          userId: user.id,
          verifierHash: rc.verifierHash,
          wrappedMk: rc.wrappedMk,
          wrapSalt: rc.wrapSalt,
        })),
      });
      await tx.webAuthnCredential.updateMany({
        where: { userId: user.id },
        data: { wrappedMk: null, prfSupported: false },
      });
      await tx.conversationKey.deleteMany({ where: { userId: user.id } });
    });

    await SessionService.revokeAllForUser(user.id);

    // Other members re-seal the CURRENT conversation key to the new identity on
    // their next online moment (Phase 4 handler). We only signal here.
    for (const conversationId of conversationIds) {
      emitToConversation(conversationId, 'conversation:member_key_reset', {
        userId: user.id,
        conversationId,
      });
    }

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    const { tokens } = await SessionService.create(user.id, meta);
    return {
      success: true as const,
      user: { id: fresh!.id, username: fresh!.username, displayName: fresh!.displayName, totpEnabled: fresh!.totpEnabled },
      tokens,
      conversationIds,
    };
  }
}
