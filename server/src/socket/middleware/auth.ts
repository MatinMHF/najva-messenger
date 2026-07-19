import { Socket } from 'socket.io';
import { verifyAccessToken } from '../../utils/jwt';
import { prisma } from '../../utils/prisma';
import { SessionService } from '../../services/session.service';

export const socketAuth = async (socket: Socket, next: (err?: any) => void) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    const decoded = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user || user.isBlocked || user.isSuspended) {
      return next(new Error('Authentication error'));
    }

    // A revoked session cannot (re)connect even with an unexpired access token.
    if (decoded.sessionId && !(await SessionService.isActive(decoded.sessionId))) {
      return next(new Error('Authentication error'));
    }

    socket.data.user = user;
    socket.data.sessionId = decoded.sessionId;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
};
