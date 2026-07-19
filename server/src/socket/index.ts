import { Server, Socket } from 'socket.io';
import { socketAuth } from './middleware/auth';
import { handleMessageEvents } from './handlers/message.handler';
import { handleTypingEvents } from './handlers/typing.handler';
import { handleCallEvents } from './handlers/call.handler';
import { handlePresenceEvents } from './handlers/presence.handler';
import { prisma } from '../utils/prisma';
import { setIoInstance } from './emitter';

export const setupSocket = (io: Server) => {
  setIoInstance(io);
  io.use(socketAuth);
  
  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.user.id;
    
    socket.join(`user:${userId}`);
    console.log('🟢 User joined room:', `user:${userId}`);

    await prisma.user.update({ where: { id: userId }, data: { status: 'ONLINE', lastSeen: new Date() } });
    socket.broadcast.emit('user:status', { userId, status: 'ONLINE', lastSeen: new Date() });

    const memberships = await prisma.conversationMember.findMany({
      where: { userId, isRemoved: false },
      select: { conversationId: true }
    });
    memberships.forEach(m => socket.join(`conv:${m.conversationId}`));

    handleMessageEvents(io, socket);
    handleTypingEvents(socket);
    handleCallEvents(io, socket);
    handlePresenceEvents(socket);
  });
};
