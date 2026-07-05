import jwt from 'jsonwebtoken';
import { config } from '../config';

export function generateTokens(userId: string) {
  const accessToken = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, config.jwtRefreshSecret, { expiresIn: '30d' });
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): { userId: string } {
  return jwt.verify(token, config.jwtSecret) as { userId: string };
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, config.jwtRefreshSecret) as { userId: string };
}
