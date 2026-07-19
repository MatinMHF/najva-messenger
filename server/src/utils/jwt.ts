import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  jti: string;
}

/**
 * Tokens are bound to a Session row. The refresh token carries a random `jti`
 * so two logins in the same second never collide on `Session.refreshTokenHash`.
 */
export const generateTokens = (userId: string, sessionId: string) => {
  const accessToken = jwt.sign({ userId, sessionId }, config.jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign(
    { userId, sessionId, jti: crypto.randomUUID() },
    config.jwtRefreshSecret,
    { expiresIn: '7d' },
  );
  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, config.jwtSecret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
