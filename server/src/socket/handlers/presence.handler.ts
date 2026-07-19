import { Socket } from 'socket.io';
import { prisma } from '../../utils/prisma';

export const handlePresenceEvents = (socket: Socket) => {
  const userId = socket.data.user.id;

  // Heartbeat: refresh lastSeen while the socket is alive and keep status ONLINE.
  socket.on('presence:heartbeat', async () => {
    const lastSeen = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'ONLINE', lastSeen }
    });
    socket.broadcast.emit('user:status', {
      userId,
      status: 'ONLINE',
      lastSeen: lastSeen.toISOString()
    });
  });

  socket.on('disconnect', async () => {
    // Only mark OFFLINE if this user has no other live sockets.
    const room = socket.nsp.adapter.rooms.get(`user:${userId}`);
    const remaining = room ? room.size : 0;
    if (remaining > 0) return;

    const lastSeen = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'OFFLINE', lastSeen }
    });
    socket.broadcast.emit('user:status', {
      userId,
      status: 'OFFLINE',
      lastSeen: lastSeen.toISOString()
    });
  });
};
