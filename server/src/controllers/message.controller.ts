import { Response, NextFunction } from 'express';
import { MessageService } from '../services/message.service';
import { prisma } from '../utils/prisma';
import { getIoInstance, isUserOnline } from '../socket/emitter';
import { NotificationService } from '../services/notification.service';

export class MessageController {
  /** Emit an event to a conversation's room and each active member's user room. */
  private static async broadcast(conversationId: string, event: string, payload: any) {
    const io = getIoInstance();
    if (!io) return;
    const members = await prisma.conversationMember.findMany({
      where: { conversationId, isRemoved: false },
      select: { userId: true },
    });
    io.to(`conv:${conversationId}`).emit(event, payload);
    members.forEach(m => io.to(`user:${m.userId}`).emit(event, payload));
  }

  static async getMessages(req: any, res: Response, next: NextFunction) {
    try {
      const cursor = req.query.cursor as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await MessageService.getMessages(req.params.id, req.user.id, cursor, limit);
      res.status(200).json(messages);
    } catch (e) { next(e); }
  }

  /**
   * Background-push a new message to members who are NOT currently connected
   * (connected members already got `message:new` over the socket). Skips the
   * sender and muted members. Payload is metadata only (sender display name) —
   * message content is E2EE. Fire-and-forget; never blocks the send response.
   */
  private static async notifyAbsentMembers(conversationId: string, senderId: string, message: any) {
    const members = await prisma.conversationMember.findMany({
      where: { conversationId, isRemoved: false, isMuted: false, userId: { not: senderId } },
      select: { userId: true },
    });
    const title = message?.sender?.displayName || message?.sender?.username || 'Najva';
    for (const m of members) {
      if (await isUserOnline(m.userId)) continue;
      await NotificationService.dispatch(m.userId, {
        title, body: 'new_message', kind: 'message', conversationId, actorId: senderId,
      }).catch(() => {});
    }
  }

  static async sendMessage(req: any, res: Response, next: NextFunction) {
    try {
      const message = await MessageService.sendMessage(req.user.id, req.params.id, req.body);
      await MessageController.broadcast(req.params.id, 'message:new', {
        message, conversationId: req.params.id,
      });
      void MessageController.notifyAbsentMembers(req.params.id, req.user.id, message);
      res.status(201).json(message);
    } catch (e) { next(e); }
  }

  static async editMessage(req: any, res: Response, next: NextFunction) {
    try {
      const message = await MessageService.editMessage(
        req.params.id, req.user.id, req.body.encryptedContent, req.body.iv
      );
      await MessageController.broadcast(message.conversationId, 'message:updated', {
        message, conversationId: message.conversationId,
      });
      res.status(200).json(message);
    } catch (e) { next(e); }
  }

  static async deleteMessage(req: any, res: Response, next: NextFunction) {
    try {
      const message = await MessageService.deleteMessage(req.params.id, req.user.id);
      await MessageController.broadcast(message.conversationId, 'message:deleted', {
        messageId: message.id, conversationId: message.conversationId,
      });
      res.status(200).json(message);
    } catch (e) { next(e); }
  }

  static async forwardMessage(req: any, res: Response, next: NextFunction) {
    try {
      const { targetConversationId } = req.body;
      const message = await MessageService.forwardMessage(req.user.id, targetConversationId, req.body);
      await MessageController.broadcast(targetConversationId, 'message:new', {
        message, conversationId: targetConversationId,
      });
      res.status(201).json(message);
    } catch (e) { next(e); }
  }
}
