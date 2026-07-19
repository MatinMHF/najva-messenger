import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export const setIoInstance = (io: Server) => {
  ioInstance = io;
};

export const getIoInstance = () => {
  return ioInstance;
};

/** Emit an event to every live socket of a given user (room `user:{id}`). */
export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
};

/** Emit an event to a conversation room (`conv:{id}`). */
export const emitToConversation = (conversationId: string, event: string, payload: unknown): void => {
  ioInstance?.to(`conv:${conversationId}`).emit(event, payload);
};

/**
 * Whether a user has at least one live socket. Used to decide between in-band
 * delivery (connected = the self-hosted "backgrounded-but-alive" channel) and
 * background push (disconnected).
 */
export const isUserOnline = async (userId: string): Promise<boolean> => {
  if (!ioInstance) return false;
  const sockets = await ioInstance.in(`user:${userId}`).fetchSockets();
  return sockets.length > 0;
};

/**
 * Force-disconnect any live socket bound to a revoked session. Sockets carry
 * their `sessionId` (set in the socket auth middleware from the access token),
 * so this targets exactly the revoked device — other devices stay connected.
 */
export const disconnectSession = (sessionId: string): void => {
  if (!ioInstance) return;
  for (const socket of ioInstance.sockets.sockets.values()) {
    if (socket.data?.sessionId === sessionId) {
      socket.emit('session:revoked', { sessionId });
      socket.disconnect(true);
    }
  }
};
