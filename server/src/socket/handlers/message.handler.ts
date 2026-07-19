import { Server, Socket } from 'socket.io';

/**
 * Realtime message events.
 *
 * NOTE: there is deliberately no `message:send` handler. Messages are created
 * only through `POST /conversations/:id/messages`, which persists the row and
 * then broadcasts `message:new` to the conversation room + each member's user
 * room (see MessageController). A socket-level send would let a client emit
 * unpersisted, unauthorized content directly into a room — so it is not offered.
 */
export const handleMessageEvents = (io: Server, socket: Socket) => {
  // Read receipt: relay only a marker (never content) to the conversation room.
  socket.on('message:read', (data) => {
    io.to(`conv:${data.conversationId}`).emit('message:read', {
      messageId: data.messageId,
      conversationId: data.conversationId,
      readBy: socket.data.user.id,
    });
  });
};
