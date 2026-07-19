import { Socket } from 'socket.io';

export const handleTypingEvents = (socket: Socket) => {
  socket.on('typing:start', (data) => {
    socket.to(`conv:${data.conversationId}`).emit('typing:update', { conversationId: data.conversationId, userId: socket.data.user.id, isTyping: true });
  });

  socket.on('typing:stop', (data) => {
    socket.to(`conv:${data.conversationId}`).emit('typing:update', { conversationId: data.conversationId, userId: socket.data.user.id, isTyping: false });
  });
};
