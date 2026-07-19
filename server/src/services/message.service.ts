import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { MessageType } from '@prisma/client';

export class MessageService {
  static async getMessages(conversationId: string, userId: string, cursor?: string, limit = 50) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!member || member.isRemoved) throw new AppError('Not a member', 403);

    const query: any = {
      where: { 
        conversationId, 
        deletedAt: null,
        ...(member.clearedAt ? { createdAt: { gt: member.clearedAt } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { attachments: true }
    };
    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }
    const messages = await prisma.message.findMany(query);

    // Automatically mark messages as read by updating lastReadMessageId to the latest message
    if (messages.length > 0 && !cursor) {
      const latestMessage = messages[0]; // first message in 'desc' list is the latest one
      await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadMessageId: latestMessage.id }
      });
    }

    return messages;
  }

  static async sendMessage(userId: string, conversationId: string, data: any) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!member || member.isRemoved) throw new AppError('Not a member', 403);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true }
    });
    if (!conversation) throw new AppError('Conversation not found', 404);

    if (conversation.type === 'DIRECT') {
      const blocked = conversation.members.some(m => m.isBlocked);
      if (blocked) throw new AppError('Blocked', 403);
    }

    // Channels are broadcast: only admins post; members are read-only.
    if (conversation.type === 'CHANNEL' && member.role !== 'ADMIN') {
      throw new AppError('Only channel admins can post', 403);
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        type: data.type as MessageType,
        encryptedContent: data.encryptedContent,
        iv: data.iv,
        ephemeralKey: data.ephemeralKey,
        senderKeyVersion: data.senderKeyVersion,
        replyToId: data.replyToId,
      },
      include: { attachments: true, sender: { select: { id: true, username: true, displayName: true } } }
    });

    if (data.attachmentIds && data.attachmentIds.length > 0) {
      await prisma.attachment.updateMany({
        where: { id: { in: data.attachmentIds } },
        data: { messageId: message.id }
      });
    }

    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      }),
      prisma.conversationMember.updateMany({
        where: { conversationId, isHidden: true },
        data: { isHidden: false }
      })
    ]);

    return prisma.message.findUnique({
      where: { id: message.id },
      include: { attachments: true, sender: { select: { id: true, username: true, displayName: true } } }
    });
  }

  static async editMessage(messageId: string, userId: string, encryptedContent: string, iv?: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError('Message not found', 404);
    if (message.senderId !== userId) throw new AppError('Unauthorized', 403);

    // A re-encrypted edit ships a fresh GCM IV; keep the old one only if the
    // caller (e.g. a same-key re-wrap) didn't supply a new one.
    return prisma.message.update({
      where: { id: messageId },
      data: { encryptedContent, ...(iv ? { iv } : {}) }
    });
  }

  static async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError('Message not found', 404);
    if (message.senderId !== userId) throw new AppError('Unauthorized', 403);

    return prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() }
    });
  }

  /**
   * Forward = a normal send under the TARGET conversation's CK, flagged
   * isForwarded. Ciphertext is bound (via AAD) to its conversation + key
   * version, so the client must decrypt under the source CK and RE-ENCRYPT
   * under the target CK before calling this; the server never copies source
   * ciphertext (which would be undecryptable in the target).
   */
  static async forwardMessage(
    userId: string,
    targetConversationId: string,
    data: { type: MessageType; encryptedContent: string; iv?: string; senderKeyVersion?: number }
  ) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: targetConversationId, userId } }
    });
    if (!member || member.isRemoved) throw new AppError('Not a member', 403);

    return prisma.message.create({
      data: {
        conversationId: targetConversationId,
        senderId: userId,
        type: data.type,
        encryptedContent: data.encryptedContent,
        iv: data.iv,
        senderKeyVersion: data.senderKeyVersion,
        isForwarded: true,
      },
      include: { attachments: true, sender: { select: { id: true, username: true, displayName: true } } }
    });
  }
}
