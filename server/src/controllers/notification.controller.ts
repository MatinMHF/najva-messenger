import { Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification.service';

export class NotificationController {
  static vapidKey(_req: any, res: Response) {
    res.status(200).json({ publicKey: NotificationService.getVapidPublicKey() });
  }

  static async subscribe(req: any, res: Response, next: NextFunction) {
    try {
      await NotificationService.subscribeWebPush(req.user.id, req.body.subscription ?? req.body);
      res.status(201).json({ success: true });
    } catch (e) { next(e); }
  }

  static async unsubscribe(req: any, res: Response, next: NextFunction) {
    try {
      const result = await NotificationService.unsubscribeWebPush(req.user.id, req.body.endpoint);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async registerDevice(req: any, res: Response, next: NextFunction) {
    try {
      await NotificationService.registerDevice(req.user.id, req.body.platform, req.body.token);
      res.status(201).json({ success: true });
    } catch (e) { next(e); }
  }

  static async list(req: any, res: Response, next: NextFunction) {
    try {
      res.status(200).json(await NotificationService.list(req.user.id));
    } catch (e) { next(e); }
  }

  static async markRead(req: any, res: Response, next: NextFunction) {
    try {
      res.status(200).json(await NotificationService.markRead(req.user.id, req.body.ids));
    } catch (e) { next(e); }
  }
}
