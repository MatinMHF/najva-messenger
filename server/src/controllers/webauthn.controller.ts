import { Request, Response, NextFunction } from 'express';
import { WebAuthnService } from '../services/webauthn.service';
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

export class WebAuthnController {
  static async registrationOptions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.registrationOptions(req.user.id, req.user.username);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async registrationVerify(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.registrationVerify(req.user.id, req.body);
      res.status(201).json(result);
    } catch (e) { next(e); }
  }

  static async setCredentialPrf(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.setCredentialPrf(req.user.id, req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async loginOptions(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.loginOptions();
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async loginVerify(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.loginVerify(req.body, sessionMeta(req));
      const { tokens, ...rest } = result;
      setRefreshCookie(res, tokens.refreshToken);
      res.status(200).json({ ...rest, tokens: { accessToken: tokens.accessToken } });
    } catch (e) { next(e); }
  }

  static async recoverOptions(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.recoverOptions();
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async recoverVerify(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.recoverVerify(req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async listCredentials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const credentials = await WebAuthnService.listCredentials(req.user.id);
      res.status(200).json({ credentials });
    } catch (e) { next(e); }
  }

  static async renameCredential(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.renameCredential(req.user.id, req.params.id, req.body?.deviceName);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async deleteCredential(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await WebAuthnService.deleteCredential(req.user.id, req.params.id, req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }
}
