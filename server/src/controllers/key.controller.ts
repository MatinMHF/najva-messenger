import { Request, Response, NextFunction } from 'express';
import { KeyService } from '../services/key.service';

export class KeyController {
  static async uploadBundle(req: any, res: Response, next: NextFunction) {
    try {
      await KeyService.uploadBundle(req.user.id, req.body);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  static async getBundle(req: Request, res: Response, next: NextFunction) {
    try {
      const bundle = await KeyService.getBundle(req.params.userId);
      res.status(200).json(bundle);
    } catch (e) { next(e); }
  }

  static async getPreKey(req: Request, res: Response, next: NextFunction) {
    try {
      const preKey = await KeyService.getPreKey(req.params.userId);
      if (!preKey) {
        return res.status(404).json({ error: 'No prekeys available' });
      }
      res.status(200).json(preKey);
    } catch (e) { next(e); }
  }
}
