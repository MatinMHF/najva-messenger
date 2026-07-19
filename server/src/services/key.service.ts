import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export class KeyService {
  static async uploadBundle(userId: string, data: any) {
    const { identityKey, signedPreKey, signedPreKeySignature, signedPreKeyId, preKeys } = data;
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        identityKeyPublic: identityKey,
        signedPreKeyPublic: signedPreKey,
        signedPreKeySignature,
        signedPreKeyId
      }
    });

    if (preKeys && preKeys.length > 0) {
      await prisma.preKey.createMany({
        data: preKeys.map((pk: any) => ({
          userId,
          keyId: pk.keyId,
          publicKey: pk.publicKey
        })),
        skipDuplicates: true
      });
    }

    return { success: true };
  }

  static async getBundle(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        identityKeyPublic: true,
        signedPreKeyPublic: true,
        signedPreKeySignature: true,
        signedPreKeyId: true,
      }
    });

    if (!user) throw new AppError('User not found', 404);
    if (!user.identityKeyPublic) throw new AppError('Keys not uploaded', 404);

    return user;
  }

  static async getPreKey(userId: string) {
    const preKey = await prisma.preKey.findFirst({
      where: { userId, used: false },
      orderBy: { keyId: 'asc' }
    });
    
    if (preKey) {
      await prisma.preKey.update({
        where: { id: preKey.id },
        data: { used: true }
      });
      return { keyId: preKey.keyId, publicKey: preKey.publicKey };
    }
    return null;
  }
}
