import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { SessionService, SessionMeta, hashToken } from '../services/session.service';
import { AppError } from '../utils/errors';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config';

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const sessionMeta = (req: Request): SessionMeta => ({
  userAgent: req.headers['user-agent'] ?? null,
  ip: req.ip ?? null,
  deviceName: typeof req.body?.deviceName === 'string' ? req.body.deviceName : null,
});

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
};

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body, sessionMeta(req));
      setRefreshCookie(res, result.tokens.refreshToken);
      res.status(201).json({
        user: result.user,
        tokens: { accessToken: result.tokens.accessToken },
      });
    } catch (e) { next(e); }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body, sessionMeta(req));
      if ('requires2FA' in result && result.requires2FA) {
        return res.status(200).json({ requires2FA: true });
      }
      const { tokens, sessionId, ...rest } = result as Extract<typeof result, { tokens: any }>;
      void sessionId;
      setRefreshCookie(res, tokens.refreshToken);
      res.status(200).json({ ...rest, tokens: { accessToken: tokens.accessToken } });
    } catch (e) { next(e); }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!refreshToken) throw new AppError('No token provided', 400);

      const { tokens } = await SessionService.rotate(refreshToken);
      setRefreshCookie(res, tokens.refreshToken);
      res.status(200).json({ accessToken: tokens.accessToken });
    } catch (e) { next(e); }
  }

  static async logout(req: Request, res: Response, _next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (refreshToken) {
        const session = await prisma.session.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });
        if (session && !session.revokedAt) {
          await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        }
      }
    } catch {
      // best-effort revoke — still clear the cookie below
    }
    res.clearCookie('refreshToken');
    res.status(200).json({ success: true });
  }

  static async params(req: Request, res: Response, next: NextFunction) {
    try {
      const username = typeof req.query.username === 'string' ? req.query.username : '';
      const result = await AuthService.getParams(username);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async listSessions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sessions = await SessionService.list(req.user.id, req.sessionId);
      res.status(200).json({ sessions });
    } catch (e) { next(e); }
  }

  static async revokeSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await SessionService.revoke(req.user.id, req.params.id);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  // ---- Password change + recovery flow A (docs/ENCRYPTION.md) ----

  static async keyMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.getKeyMaterial(req.user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.changePassword(req.user.id, req.sessionId, req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async recoverVerify(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.recoverVerify(req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async recoverComplete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.recoverComplete(req.body, sessionMeta(req));
      setRefreshCookie(res, result.tokens.refreshToken);
      const { tokens, ...rest } = result;
      res.status(200).json({ ...rest, tokens: { accessToken: tokens.accessToken } });
    } catch (e) { next(e); }
  }

  static async setup2FA(req: any, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.setup2FA(req.user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async verify2FA(req: any, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.verify2FA(req.user.id, req.body.code);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async disable2FA(req: any, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.disable2FA(req.user.id, req.body.code);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async resetRecoveryCodes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.regenerateRecoveryCodes(req.user.id, req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  /**
   * Step-1 username existence check for the forgot-password wizard. The device
   * handshake itself is recovery flow C (see ResetController); this endpoint only
   * confirms the account exists before the user picks a recovery method.
   */
  static async requestReset(req: Request, res: Response, next: NextFunction) {
    try {
      const { username } = req.body;
      if (!username) {
        throw new AppError('Username is required', 400);
      }
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        throw new AppError('No account found with that username', 404);
      }
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }
}
