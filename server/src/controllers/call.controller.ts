import { Response, NextFunction } from 'express';
import { CallService } from '../services/call.service';

export class CallController {
  static async grant(req: any, res: Response, next: NextFunction) {
    try {
      const grant = await CallService.issueGrant(req.user.id, req.params.conversationId);
      res.status(200).json(grant);
    } catch (e) { next(e); }
  }

  static async ice(req: any, res: Response, next: NextFunction) {
    try {
      res.status(200).json({ iceServers: CallService.iceServers(req.user.id) });
    } catch (e) { next(e); }
  }
}
