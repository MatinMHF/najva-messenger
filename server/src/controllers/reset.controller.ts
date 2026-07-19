import { Request, Response, NextFunction } from 'express';
import { ResetService } from '../services/reset.service';
import { SessionMeta } from '../services/session.service';
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

export class ResetController {
  // ---- Flow C ----
  static async request(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.request(req.body, sessionMeta(req));
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async approve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.approve(req.user.id, req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async deny(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.deny(req.user.id, req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async status(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.status(req.params.resetId, req.query.secret);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.complete(req.body, sessionMeta(req));
      setRefreshCookie(res, result.tokens.refreshToken);
      const { tokens, ...rest } = result;
      res.status(200).json({ ...rest, tokens: { accessToken: tokens.accessToken } });
    } catch (e) { next(e); }
  }

  // ---- Flow D ----
  static async lost(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.completeLost(req.body, sessionMeta(req));
      setRefreshCookie(res, result.tokens.refreshToken);
      const { tokens, ...rest } = result;
      res.status(200).json({ ...rest, tokens: { accessToken: tokens.accessToken } });
    } catch (e) { next(e); }
  }
}
