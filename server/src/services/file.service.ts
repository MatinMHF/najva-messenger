import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import fs from 'fs';

export interface UploadMeta {
  encryptedKey?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export class FileService {
  /**
   * Store an already-encrypted attachment blob (docs/ENCRYPTION.md,
   * "Attachments"). The bytes arrive as opaque ciphertext — the server does NOT
   * inspect, transcode, or thumbnail them (thumbnails are generated + encrypted
   * client-side and arrive as a second opaque blob). `encryptedKey` is the FK
   * wrapped under the conversation key; the server just persists it.
   */
  static async uploadFile(
    userId: string,
    file: Express.Multer.File,
    thumbnail: Express.Multer.File | undefined,
    meta: UploadMeta,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const totalSize = BigInt(file.size) + BigInt(thumbnail?.size ?? 0);
    if (user.storageUsed + totalSize > user.storageLimit) {
      fs.unlinkSync(file.path);
      if (thumbnail) fs.unlinkSync(thumbnail.path);
      throw new AppError('Storage limit exceeded', 400);
    }

    const attachment = await prisma.attachment.create({
      data: {
        fileName: file.originalname,
        filePath: file.path,
        fileSize: BigInt(file.size),
        // The real content type is inside the ciphertext; the transport blob is
        // opaque (octet-stream). Persist the client-declared real type for
        // display hints so the recipient renders image/audio/video correctly.
        mimeType: meta.mimeType || file.mimetype,
        encryptedKey: meta.encryptedKey,
        thumbnailPath: thumbnail?.path,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { storageUsed: { increment: totalSize } },
    });

    return {
      id: attachment.id,
      url: `/api/files/${attachment.id}`,
      thumbnailUrl: thumbnail ? `/api/files/${attachment.id}/thumbnail` : undefined,
    };
  }

  /**
   * Fetch an attachment only if the requester is an active member of the
   * conversation the attachment's message belongs to. Unlinked (orphan)
   * attachments are inaccessible — download only ever happens for sent messages.
   */
  static async getFileForUser(attachmentId: string, userId: string) {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { conversationId: true } } },
    });
    if (!attachment) throw new AppError('File not found', 404);
    if (!attachment.messageId || !attachment.message) throw new AppError('Forbidden', 403);

    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: attachment.message.conversationId, userId },
      },
    });
    if (!member || member.isRemoved) throw new AppError('Forbidden', 403);
    return attachment;
  }
}
