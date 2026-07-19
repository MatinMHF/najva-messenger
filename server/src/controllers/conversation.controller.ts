import { Request, Response, NextFunction } from 'express';
import { ConversationService } from '../services/conversation.service';
import { getIoInstance } from '../socket/emitter';

export class ConversationController {
  static async list(req: any, res: Response, next: NextFunction) {
    try {
      const convs = await ConversationService.listUserConversations(req.user.id);
      res.status(200).json(convs);
    } catch (e) { next(e); }
  }

  static async createGroup(req: any, res: Response, next: NextFunction) {
    try {
      const conv = await ConversationService.createGroup(req.user.id, req.body);
      res.status(201).json(conv);
    } catch (e) { next(e); }
  }

  static async getConversation(req: any, res: Response, next: NextFunction) {
    try {
      const conv = await ConversationService.getConversation(req.params.id, req.user.id);
      res.status(200).json(conv);
    } catch (e) { next(e); }
  }

  static async updateGroup(req: any, res: Response, next: NextFunction) {
    try {
      const conv = await ConversationService.updateGroup(req.params.id, req.user.id, req.body);
      res.status(200).json(conv);
    } catch (e) { next(e); }
  }

  static async addMembers(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.addMembers(req.params.id, req.user.id, req.body.members);
      const io = getIoInstance();
      if (io) {
        result.addedUserIds.forEach(uid =>
          io.to(`user:${uid}`).emit('conversation:added', { conversationId: req.params.id })
        );
      }
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async removeMember(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.removeMember(
        req.params.id, req.user.id, req.params.userId, req.body.rotation
      );
      const io = getIoInstance();
      if (io) {
        // Targeted new-version wrap notice to each remaining member, plus a
        // room-wide "rotated" nudge so live clients refetch keys.
        result.remainingMemberIds.forEach(uid =>
          io.to(`user:${uid}`).emit('conversation:key', {
            conversationId: req.params.id, version: result.newVersion,
          })
        );
        io.to(`conv:${req.params.id}`).emit('conversation:key_rotated', {
          conversationId: req.params.id, version: result.newVersion,
        });
        io.to(`user:${result.removedUserId}`).emit('conversation:removed', {
          conversationId: req.params.id,
        });
      }
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async leaveGroup(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.leaveGroup(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  /** GET existing DM only (no auto-create — creation needs client-sealed CK wraps). */
  static async getOrCreateDM(req: any, res: Response, next: NextFunction) {
    try {
      const conv = await ConversationService.findDM(req.user.id, req.params.userId);
      if (!conv) return res.status(404).json({ error: 'No direct conversation yet' });
      res.status(200).json(conv);
    } catch (e) { next(e); }
  }

  /** POST get-or-create DM with client-supplied CK wraps for both members. */
  static async createDM(req: any, res: Response, next: NextFunction) {
    try {
      const { targetUserId, wrappedKeys } = req.body;
      const { conversation, created } = await ConversationService.getOrCreateDM(
        req.user.id, targetUserId, wrappedKeys
      );
      res.status(created ? 201 : 200).json(conversation);
    } catch (e) { next(e); }
  }

  static async getKeys(req: any, res: Response, next: NextFunction) {
    try {
      const keys = await ConversationService.getConversationKeys(req.params.id, req.user.id);
      res.status(200).json(keys);
    } catch (e) { next(e); }
  }

  static async getSavedMessages(req: any, res: Response, next: NextFunction) {
    try {
      const conv = await ConversationService.getSavedMessages(req.user.id);
      res.status(200).json(conv);
    } catch (e) { next(e); }
  }

  // ---- Mute / Block / Delete (item 5) ----
  static async mute(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.muteConversation(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async unmute(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.unmuteConversation(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async block(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.blockConversation(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async unblock(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.unblockConversation(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  /** Tell every affected member's live clients to drop a permanently-deleted chat. */
  private static emitDeleted(conversationId: string, memberIds: string[]) {
    const io = getIoInstance();
    if (!io) return;
    memberIds.forEach(uid => io.to(`user:${uid}`).emit('conversation:deleted', { conversationId }));
  }

  /** Tell every affected member's live clients that a chat's history was cleared. */
  private static emitCleared(conversationId: string, memberIds: string[]) {
    const io = getIoInstance();
    if (!io) return;
    memberIds.forEach(uid => io.to(`user:${uid}`).emit('conversation:cleared', { conversationId }));
  }

  static async deleteConversation(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.deleteConversation(req.params.id, req.user.id, {
        deleteHistory: !!req.body?.deleteHistory,
        forEveryone: !!req.body?.forEveryone,
      });
      if (result.deleted) ConversationController.emitDeleted(req.params.id, result.memberIds);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async clearHistory(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ConversationService.clearHistory(req.params.id, req.user.id, {
        forEveryone: !!req.body?.forEveryone,
      });
      if (result.cleared) ConversationController.emitCleared(req.params.id, result.memberIds);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async pinMessage(req: any, res: Response, next: NextFunction) {
    try {
      const { messageId, action } = req.body;
      const result = await ConversationService.pinMessage(req.params.id, req.user.id, messageId, action);
      const io = getIoInstance();
      if (io) {
        io.to(`conv:${req.params.id}`).emit('conversation:pinned_changed', {
          conversationId: req.params.id,
          pinnedMessageIds: result.pinnedMessageIds,
        });
      }
      res.status(200).json(result);
    } catch (e) { next(e); }
  }
}
