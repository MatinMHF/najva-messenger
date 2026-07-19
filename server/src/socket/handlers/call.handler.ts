import { Server, Socket } from 'socket.io';
import { redisClient } from '../../utils/redis';
import { prisma } from '../../utils/prisma';
import { isUserOnline } from '../emitter';
import { NotificationService } from '../../services/notification.service';

/**
 * Call lifecycle signaling for the SFU (Module D). Media itself flows through
 * the mediasoup media-server; this handler only rings members, tracks who is in
 * a conversation's call (Redis participant set, for "call active" + clean
 * teardown), and relays accept/reject/end. There is NO SDP/ICE relay here — the
 * SFU negotiates media directly with each client.
 *
 * Authorization: a socket auto-joins `conv:{id}` rooms only for conversations it
 * belongs to (see socket/index.ts), so `socket.rooms.has('conv:'+id)` is a cheap
 * membership check that stops a client ringing conversations it isn't in.
 */
const CALL_TTL_SECONDS = 3600; // safety expiry so a crashed call can't linger
const participantsKey = (conversationId: string) => `call:${conversationId}:participants`;
const metaKey = (conversationId: string) => `call:${conversationId}:meta`;

const isMember = (socket: Socket, conversationId: string): boolean =>
  typeof conversationId === 'string' && socket.rooms.has(`conv:${conversationId}`);

/** Background-push an incoming call to members without a live socket. */
async function notifyAbsentCallees(conversationId: string, callerId: string): Promise<void> {
  const caller = await prisma.user.findUnique({ where: { id: callerId }, select: { displayName: true, username: true } });
  const members = await prisma.conversationMember.findMany({
    where: { conversationId, isRemoved: false, isMuted: false, userId: { not: callerId } },
    select: { userId: true },
  });
  const title = caller?.displayName || caller?.username || 'Najva';
  for (const m of members) {
    if (await isUserOnline(m.userId)) continue;
    await NotificationService.dispatch(m.userId, {
      title, body: 'incoming_call', kind: 'call', conversationId, actorId: callerId,
    }).catch(() => {});
  }
}

async function leaveCall(io: Server, conversationId: string, userId: string): Promise<void> {
  await redisClient.srem(participantsKey(conversationId), userId);
  io.to(`conv:${conversationId}`).emit('call:participant_left', { conversationId, userId });
  const remaining = await redisClient.scard(participantsKey(conversationId));
  
  // If it's a DIRECT (1:1) call, the call is over if there is only 1 or 0 participants left.
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true },
  });
  const isDirect = conv?.type === 'DIRECT';

  if (remaining === 0 || (isDirect && remaining <= 1)) {
    await redisClient.del(participantsKey(conversationId));
    await redisClient.del(metaKey(conversationId));
    io.to(`conv:${conversationId}`).emit('call:ended', { conversationId });
  }
}

export const handleCallEvents = (io: Server, socket: Socket) => {
  const userId = socket.data.user.id;
  // Conversations this socket is currently in a call for (for disconnect cleanup).
  const activeCalls = new Set<string>();

  socket.on('call:initiate', async ({ conversationId, type }) => {
    const member = isMember(socket, conversationId);
    console.log(`[call] initiate from ${userId} conv=${conversationId} type=${type} isMember=${member} rooms=${[...socket.rooms].filter(r => r.startsWith('conv:')).length}`);
    if (!member) return;
    await redisClient.set(metaKey(conversationId), JSON.stringify({ type, startedBy: userId }), 'EX', CALL_TTL_SECONDS);
    await redisClient.sadd(participantsKey(conversationId), userId);
    await redisClient.expire(participantsKey(conversationId), CALL_TTL_SECONDS);
    activeCalls.add(conversationId);
    const room = io.sockets.adapter.rooms.get(`conv:${conversationId}`);
    console.log(`[call] emitting call:incoming to conv:${conversationId} — ${room ? room.size : 0} socket(s) in room`);
    socket.to(`conv:${conversationId}`).emit('call:incoming', { conversationId, callerId: userId, type });
    void notifyAbsentCallees(conversationId, userId);
  });

  socket.on('call:accept', async ({ conversationId }) => {
    if (!isMember(socket, conversationId)) return;
    await redisClient.sadd(participantsKey(conversationId), userId);
    activeCalls.add(conversationId);
    io.to(`conv:${conversationId}`).emit('call:accepted', { conversationId, userId });
  });

  socket.on('call:reject', ({ conversationId }) => {
    if (!isMember(socket, conversationId)) return;
    socket.to(`conv:${conversationId}`).emit('call:rejected', { conversationId, userId });
  });

  socket.on('call:end', async ({ conversationId }) => {
    if (!isMember(socket, conversationId)) return;
    activeCalls.delete(conversationId);
    await leaveCall(io, conversationId, userId);
  });

  socket.on('disconnect', async () => {
    for (const conversationId of activeCalls) {
      await leaveCall(io, conversationId, userId);
    }
    activeCalls.clear();
  });
};
