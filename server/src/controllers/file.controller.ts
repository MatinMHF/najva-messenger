import { Response, NextFunction } from 'express';
import { FileService } from '../services/file.service';
import { AppError } from '../utils/errors';
import fs from 'fs';

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export class FileController {
  static async uploadFile(req: any, res: Response, next: NextFunction) {
    try {
      const file = req.files?.file?.[0];
      const thumbnail = req.files?.thumbnail?.[0];
      if (!file) throw new AppError('No file uploaded', 400);
      const result = await FileService.uploadFile(req.user.id, file, thumbnail, {
        encryptedKey: req.body.encryptedKey,
        mimeType: typeof req.body.mimeType === 'string' ? req.body.mimeType : undefined,
        width: num(req.body.width),
        height: num(req.body.height),
        duration: num(req.body.duration),
      });
      res.status(201).json(result);
    } catch (e) { next(e); }
  }

  static async getFile(req: any, res: Response, next: NextFunction) {
    try {
      const attachment = await FileService.getFileForUser(req.params.id, req.user.id);
      res.download(attachment.filePath, attachment.fileName);
    } catch (e) { next(e); }
  }

  static async getThumbnail(req: any, res: Response, next: NextFunction) {
    try {
      const attachment = await FileService.getFileForUser(req.params.id, req.user.id);
      if (!attachment.thumbnailPath || !fs.existsSync(attachment.thumbnailPath)) {
        return res.status(404).json({ error: 'Thumbnail not found' });
      }
      res.download(attachment.thumbnailPath);
    } catch (e) { next(e); }
  }
}
