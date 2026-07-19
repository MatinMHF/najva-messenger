import { prisma } from '../utils/prisma';
import bcrypt from 'bcryptjs';
import { AppError } from '../utils/errors';

export class UserService {
  static async searchUsers(query: string) {
    if (!query) return [];
    return prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        status: true,
        lastSeen: true,
        totpEnabled: true
      },
      take: 20
    });
  }

  static async getUserProfile(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        status: true,
        lastSeen: true,
        totpEnabled: true
      }
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  static async updateProfile(userId: string, data: any) {
    const updateData: any = {
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      bio: data.bio
    };

    if (data.username !== undefined) {
      const existing = await prisma.user.findUnique({
        where: { username: data.username }
      });
      if (existing && existing.id !== userId) {
        throw new AppError('Username already taken', 400);
      }
      updateData.username = data.username;
    }

    return prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        status: true,
        lastSeen: true,
        totpEnabled: true
      }
    });
  }

  static async updateSettings(userId: string, data: any) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        language: data.language,
        theme: data.theme
      },
      select: {
        language: true,
        theme: true
      }
    });
  }

  static async changePassword(userId: string, data: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const isMatch = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!isMatch) throw new AppError('Invalid current password', 400);

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
    return { success: true };
  }
}
