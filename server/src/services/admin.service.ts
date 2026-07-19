import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import bcrypt from 'bcryptjs';

export class AdminService {
  static async listUsers(page = 1, limit = 50, search = '') {
    const skip = (page - 1) * limit;
    const where = search ? {
      OR: [
        { username: { contains: search, mode: 'insensitive' as const } },
        { displayName: { contains: search, mode: 'insensitive' as const } }
      ]
    } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: { id: true, username: true, displayName: true, isBlocked: true, isSuspended: true, storageUsed: true, storageLimit: true }
      }),
      prisma.user.count({ where })
    ]);

    // storageUsed/storageLimit are BigInt columns; Express res.json() cannot
    // serialize BigInt, so normalize to Number (byte counts stay well within
    // Number.MAX_SAFE_INTEGER).
    const serialized = users.map((u) => ({
      ...u,
      storageUsed: Number(u.storageUsed ?? 0),
      storageLimit: Number(u.storageLimit ?? 0),
    }));

    return { users: serialized, total, page, limit };
  }

  static async blockUser(id: string) {
    return prisma.user.update({ where: { id }, data: { isBlocked: true } });
  }

  static async unblockUser(id: string) {
    return prisma.user.update({ where: { id }, data: { isBlocked: false } });
  }

  static async suspendUser(id: string, reason: string) {
    return prisma.user.update({ where: { id }, data: { isSuspended: true, suspendReason: reason } });
  }

  static async unsuspendUser(id: string) {
    return prisma.user.update({ where: { id }, data: { isSuspended: false, suspendReason: null } });
  }

  static async setStorageLimit(id: string, limit: number) {
    return prisma.user.update({ where: { id }, data: { storageLimit: BigInt(limit) } });
  }

  static async resetPassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    return prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
