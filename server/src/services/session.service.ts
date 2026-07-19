import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { disconnectSession } from '../socket/emitter';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
  deviceName?: string | null;
}

/** SHA-256 of a refresh token — only the hash is ever stored. */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export class SessionService {
  /** Issue a fresh token pair and persist the backing Session row. */
  static async create(userId: string, meta: SessionMeta = {}) {
    const sessionId = crypto.randomUUID();
    const tokens = generateTokens(userId, sessionId);
    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: hashToken(tokens.refreshToken),
        deviceName: meta.deviceName ?? null,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { tokens, sessionId };
  }

  /**
   * Refresh rotation with reuse detection. Presenting the current token rotates
   * it; presenting ANY already-rotated token for a still-valid, non-revoked
   * session is reuse — whether it's the immediately-prior generation
   * (`prevTokenHash`) or one rotated away further back — and revokes the
   * whole session.
   */
  static async rotate(refreshToken: string) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }

    const hash = hashToken(refreshToken);
    const session = await prisma.session.findUnique({ where: { id: decoded.sessionId } });
    if (!session) throw new AppError('Invalid session', 401);

    if (session.revokedAt) throw new AppError('Session revoked', 401);
    if (session.expiresAt.getTime() < Date.now()) throw new AppError('Session expired', 401);

    if (session.refreshTokenHash !== hash) {
      // Not the current token, but the session itself is valid and active —
      // this is reuse of a stale token (regardless of how many generations
      // back it was rotated away). Revoke to force re-authentication.
      await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      disconnectSession(session.id);
      throw new AppError('Refresh token reuse detected', 401);
    }

    const tokens = generateTokens(session.userId, session.id);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        prevTokenHash: hash,
        refreshTokenHash: hashToken(tokens.refreshToken),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { tokens };
  }

  /** Active (not revoked, not expired) sessions for a user, newest first. */
  static async list(userId: string, currentSessionId?: string) {
    const sessions = await prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke every active session for a user, optionally sparing one (the caller's
   * current session on a password change). Disconnects the affected sockets.
   * Returns the number of sessions revoked.
   */
  static async revokeAllForUser(userId: string, exceptSessionId?: string) {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    if (sessions.length === 0) return 0;
    await prisma.session.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
    for (const s of sessions) disconnectSession(s.id);
    return sessions.length;
  }

  /** Revoke one session (must belong to the user) and disconnect its socket. */
  static async revoke(userId: string, sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new AppError('Session not found', 404);
    if (!session.revokedAt) {
      await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    }
    disconnectSession(sessionId);
    return { success: true };
  }

  static async isActive(sessionId: string): Promise<boolean> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    return !!session && !session.revokedAt && session.expiresAt.getTime() > Date.now();
  }
}
