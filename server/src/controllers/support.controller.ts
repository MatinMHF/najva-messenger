import { Request, Response, NextFunction } from 'express';
import { SupportService } from '../services/support.service';

export class SupportController {
  static async createTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = await SupportService.createTicket(req.body.username, req.body.message);
      res.cookie('supportSession', ticket.sessionToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.status(201).json(ticket);
    } catch (e) { next(e); }
  }

  static async getTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies.supportSession || req.params.token;
      const ticket = await SupportService.getTicket(token);
      res.status(200).json(ticket);
    } catch (e) { next(e); }
  }

  static async addMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies.supportSession || req.params.token;
      const msg = await SupportService.addMessage(token, req.body.content, 'USER');
      res.status(201).json(msg);
    } catch (e) { next(e); }
  }
}
