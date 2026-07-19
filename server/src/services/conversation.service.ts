import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

/** A client-supplied Conversation-Key wrap: the CK sealed to `userId`'s identity key. */
export interface CkWrap {
  userId: string;
  wrappedKey: string;
}

/**
 * Verify a client-supplied set of CK wraps exactly covers `requiredIds` — one
 * non-empty wrap per required member, no missing members, no strangers. The
 * server never inspects wrap contents (opaque sealed boxes); it only enforces
 * that every member who must be able to derive the CK actually got a wrap.
 */
function assertShareSet(wraps: CkWrap[] | undefined, requiredIds: string[]): CkWrap[] {
  if (!Array.isArray(wraps)) throw new AppError('Missing conversation-key wraps', 400);
  const required = new Set(requiredIds);
  const seen = new Set<string>();
  for (const w of wraps) {
    if (!w || typeof w.userId !== 'string' || !w.wrappedKey) {
      throw new AppError('Malformed conversation-key wrap', 400);
    }
    if (!required.has(w.userId)) throw new AppError(`Unexpected wrap for ${w.userId}`, 400);
    if (seen.has(w.userId)) throw new AppError(`Duplicate wrap for ${w.userId}`, 400);
    seen.add(w.userId);
  }
  if (seen.size !== required.size) throw new AppError('Incomplete conversation-key share set', 400);
  return wraps;
}

export class ConversationService {
  static async listUserConversations(userId: string) {
    return prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId,
            isRemoved: false,
            isHidden: false
          }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, status: true, lastSeen: true }
            }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  static async createGroup(
    userId: string,
    data: { name: string; memberIds: string[]; type?: 'GROUP' | 'CHANNEL'; wrappedKeys: CkWrap[] }
  ) {
    const type = data.type === 'CHANNEL' ? 'CHANNEL' : 'GROUP';
    // Dedup so a creator accidentally listed in memberIds doesn't double-insert.
    const allMembers = Array.from(new Set([userId, ...(data.memberIds ?? [])]));
    const wraps = assertShareSet(data.wrappedKeys, allMembers);

    return prisma.conversation.create({
      data: {
        type,
        name: data.name,
        createdById: userId,
        currentKeyVersion: 1,
        members: {
          create: allMembers.map(id => ({
            userId: id,
            role: id === userId ? 'ADMIN' : 'MEMBER'
          }))
        },
        keys: {
          create: wraps.map(w => ({
            userId: w.userId,
            version: 1,
            wrappedKey: w.wrappedKey,
            wrappedById: userId,
          }))
        }
      },
      include: {
        members: true
      }
    });
  }

  static async getConversation(conversationId: string, userId: string) {
    const conv = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        members: {
          some: { userId, isRemoved: false }
        }
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } }
          }
        }
      }
    });
    if (!conv) throw new AppError('Conversation not found', 404);
    return conv;
  }

  static async updateGroup(conversationId: string, userId: string, data: any) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!member || member.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

    return prisma.conversation.update({
      where: { id: conversationId },
      data: {
        name: data.name,
        avatarUrl: data.avatarUrl
      }
    });
  }

  static async addMembers(conversationId: string, userId: string, newMembers: CkWrap[]) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!member || member.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }
    if (!Array.isArray(newMembers) || newMembers.length === 0) {
      throw new AppError('No members to add', 400);
    }
    for (const m of newMembers) {
      if (!m || typeof m.userId !== 'string' || !m.wrappedKey) {
        throw new AppError('Each added member needs a conversation-key wrap', 400);
      }
    }

    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new AppError('Conversation not found', 404);
    const version = conv.currentKeyVersion;

    await prisma.$transaction([
      prisma.conversationMember.createMany({
        data: newMembers.map(m => ({ conversationId, userId: m.userId, role: 'MEMBER' as const })),
        skipDuplicates: true,
      }),
      prisma.conversationKey.createMany({
        data: newMembers.map(m => ({
          conversationId,
          userId: m.userId,
          version,
          wrappedKey: m.wrappedKey,
          wrappedById: userId,
        })),
        skipDuplicates: true,
      }),
    ]);
    return { success: true, addedUserIds: newMembers.map(m => m.userId) };
  }

  /**
   * Remove a member and rotate the CK forward so the removed member cannot read
   * post-removal messages. The caller's client supplies a fresh CK (version
   * currentKeyVersion+1) sealed to every *remaining* active member; the server
   * validates completeness, then atomically removes the target, writes the new
   * wraps, and bumps currentKeyVersion. Returns the data the controller needs to
   * emit key-rotation events.
   */
  static async removeMember(
    conversationId: string,
    adminId: string,
    targetUserId: string,
    rotation: { keys: CkWrap[] }
  ) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: adminId } }
    });
    if (!member || member.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { where: { isRemoved: false } } },
    });
    if (!conv) throw new AppError('Conversation not found', 404);

    const remaining = conv.members
      .map(m => m.userId)
      .filter(id => id !== targetUserId);
    const wraps = assertShareSet(rotation?.keys, remaining);
    const newVersion = conv.currentKeyVersion + 1;

    await prisma.$transaction([
      prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
        data: { isRemoved: true },
      }),
      prisma.conversationKey.createMany({
        data: wraps.map(w => ({
          conversationId,
          userId: w.userId,
          version: newVersion,
          wrappedKey: w.wrappedKey,
          wrappedById: adminId,
        })),
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { currentKeyVersion: newVersion },
      }),
    ]);
    return { success: true, newVersion, removedUserId: targetUserId, remainingMemberIds: remaining };
  }

  static async getConversationKeys(conversationId: string, userId: string) {
    await this.requireMember(conversationId, userId);
    return prisma.conversationKey.findMany({
      where: { conversationId, userId },
      orderBy: { version: 'asc' },
      select: { version: true, wrappedKey: true, wrappedById: true },
    });
  }

  static async leaveGroup(conversationId: string, userId: string) {
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isRemoved: true }
    });
    return { success: true };
  }

  /** Read-only: return an existing DM between the two users, or null. */
  static async findDM(userId: string, targetUserId: string) {
    return prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } }
        ]
      },
      include: { members: true }
    });
  }

  /**
   * DM used only for server-authored plaintext SYSTEM messages (e.g. the
   * najva-support OTP channel). No Conversation-Key: every message here is
   * `isSystemPlaintext`, so there is nothing to encrypt and no wraps to require.
   */
  static async getOrCreateSystemDM(userId: string, targetUserId: string) {
    const existing = await this.findDM(userId, targetUserId);
    if (existing) return existing;
    return prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdById: userId,
        members: {
          create: [
            { userId, role: 'ADMIN' },
            { userId: targetUserId, role: 'ADMIN' }
          ]
        }
      },
      include: { members: true }
    });
  }

  static async getOrCreateDM(userId: string, targetUserId: string, wrappedKeys?: CkWrap[]) {
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } }
        ]
      },
      include: { members: true }
    });
    if (existing) {
      const myMember = existing.members.find(m => m.userId === userId);
      if (myMember && myMember.isHidden) {
        await prisma.conversationMember.update({
          where: { conversationId_userId: { conversationId: existing.id, userId } },
          data: { isHidden: false }
        });
        myMember.isHidden = false;
      }
      return { conversation: existing, created: false };
    }

    const wraps = assertShareSet(wrappedKeys, Array.from(new Set([userId, targetUserId])));
    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdById: userId,
        currentKeyVersion: 1,
        members: {
          create: [
            { userId, role: 'ADMIN' },
            { userId: targetUserId, role: 'ADMIN' }
          ]
        },
        keys: {
          create: wraps.map(w => ({
            userId: w.userId,
            version: 1,
            wrappedKey: w.wrappedKey,
            wrappedById: userId,
          }))
        }
      },
      include: { members: true }
    });
    return { conversation, created: true };
  }

  static async getSavedMessages(userId: string) {
    let conv = await prisma.conversation.findFirst({
      where: {
        type: 'SAVED_MESSAGES',
        createdById: userId
      },
      include: { members: true }
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          type: 'SAVED_MESSAGES',
          name: 'Saved Messages',
          createdById: userId,
          members: {
            create: { userId, role: 'ADMIN' }
          }
        },
        include: { members: true }
      });
    }
    return conv;
  }

  private static async requireMember(conversationId: string, userId: string) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!member || member.isRemoved) throw new AppError('Not a member', 403);
    return member;
  }

  static async muteConversation(conversationId: string, userId: string) {
    await this.requireMember(conversationId, userId);
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isMuted: true }
    });
    return { success: true };
  }

  static async unmuteConversation(conversationId: string, userId: string) {
    await this.requireMember(conversationId, userId);
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isMuted: false }
    });
    return { success: true };
  }

  static async blockConversation(conversationId: string, userId: string) {
    await this.requireMember(conversationId, userId);
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isBlocked: true }
    });
    return { success: true };
  }

  static async unblockConversation(conversationId: string, userId: string) {
    await this.requireMember(conversationId, userId);
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isBlocked: false }
    });
    return { success: true };
  }

  /**
   * Permanently delete a conversation and everything under it (members, keys,
   * messages, attachments cascade via the schema) for EVERY participant. Only
   * DIRECT chats can be nuked for both sides by either member; group/channel
   * "delete for everyone" is intentionally not offered here. Returns the member
   * ids so the controller can tell each live client to drop the chat.
   */
  private static async hardDelete(conversationId: string, userId: string) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!conv) throw new AppError('Conversation not found', 404);
    if (conv.type !== 'DIRECT') throw new AppError('Only direct chats can be deleted for everyone', 400);
    const memberIds = conv.members.map(m => m.userId);
    await prisma.conversation.delete({ where: { id: conversationId } });
    return { success: true, deleted: true as const, memberIds };
  }

  /**
   * Delete a conversation for the caller (hide it). `deleteHistory` also clears
   * the caller's message history (so re-opening the DM later won't resurface old
   * messages). `forEveryone` permanently removes it for both participants.
   */
  static async deleteConversation(
    conversationId: string,
    userId: string,
    opts: { deleteHistory?: boolean; forEveryone?: boolean } = {},
  ) {
    await this.requireMember(conversationId, userId);
    if (opts.forEveryone) return this.hardDelete(conversationId, userId);
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isHidden: true, ...(opts.deleteHistory ? { clearedAt: new Date() } : {}) },
    });
    return { success: true, deleted: false as const };
  }

  /**
   * Clear the caller's message history (hide messages older than now via
   * `clearedAt`). `forEveryone` instead permanently deletes the whole DM for both
   * participants (per the product spec for the "delete for the other participant"
   * option on Clear History).
   */
  static async clearHistory(
    conversationId: string,
    userId: string,
    opts: { forEveryone?: boolean } = {},
  ) {
    await this.requireMember(conversationId, userId);
    
    if (opts.forEveryone) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { members: true },
      });
      if (!conv) throw new AppError('Conversation not found', 404);
      if (conv.type !== 'DIRECT') throw new AppError('Only direct chats can be cleared for everyone', 400);
      
      const memberIds = conv.members.map(m => m.userId);
      const now = new Date();
      
      await prisma.conversationMember.updateMany({
        where: { conversationId },
        data: { clearedAt: now }
      });
      
      return { success: true, cleared: true as const, memberIds };
    }
    
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { clearedAt: new Date() }
    });
    return { success: true, cleared: false as const };
  }

  static async pinMessage(
    conversationId: string,
    userId: string,
    messageId: string,
    action: 'pin' | 'unpin'
  ) {
    await this.requireMember(conversationId, userId);
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new AppError('Conversation not found', 404);

    let currentPinned: string[] = [];
    if (conv.pinnedMessageIds) {
      try {
        currentPinned = JSON.parse(conv.pinnedMessageIds);
      } catch (e) {
        currentPinned = conv.pinnedMessageIds.split(',').filter(Boolean);
      }
    }

    if (action === 'pin') {
      if (!currentPinned.includes(messageId)) {
        currentPinned.push(messageId);
      }
    } else if (action === 'unpin') {
      currentPinned = currentPinned.filter(id => id !== messageId);
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        pinnedMessageIds: JSON.stringify(currentPinned),
      },
    });

    return {
      success: true,
      pinnedMessageIds: updated.pinnedMessageIds,
    };
  }
}
