import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import { StatsService } from '../services/stats.service';
import { SupportService } from '../services/support.service';
import { ResetService } from '../services/reset.service';
import { prisma } from '../utils/prisma';

export class AdminController {
  /**
   * Recovery flow D (docs/ENCRYPTION.md): issue a one-time, 24-hour authorization
   * token so a user who has lost every other recovery path can re-key from
   * scratch. The admin verifies identity out-of-band first and hands the token to
   * the user via support chat. This is explicitly lossy — old messages become
   * permanently unreadable.
   */
  static async authorizeReset(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResetService.authorizeReset(req.params.id);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string || '';
      const result = await AdminService.listUsers(page, limit, search);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async blockUser(req: Request, res: Response, next: NextFunction) {
    try {
      await AdminService.blockUser(req.params.id);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  static async unblockUser(req: Request, res: Response, next: NextFunction) {
    try {
      await AdminService.unblockUser(req.params.id);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  static async suspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      await AdminService.suspendUser(req.params.id, req.body.reason);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  static async unsuspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      await AdminService.unsuspendUser(req.params.id);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  static async setStorageLimit(req: Request, res: Response, next: NextFunction) {
    try {
      await AdminService.setStorageLimit(req.params.id, req.body.limit);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      await AdminService.resetPassword(req.params.id, req.body.newPassword);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await StatsService.getServerStats();
      res.status(200).json(stats);
    } catch (e) { next(e); }
  }

  static async listSupportTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const tickets = await SupportService.listTickets();
      res.status(200).json(tickets);
    } catch (e) { next(e); }
  }

  static async getSupportTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: req.params.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
      });
      res.status(200).json(ticket);
    } catch (e) { next(e); }
  }

  static async replySupportTicket(req: any, res: Response, next: NextFunction) {
    try {
      const msg = await prisma.supportMessage.create({
        data: {
          ticketId: req.params.id,
          senderType: 'ADMIN',
          senderId: req.user.id,
          content: req.body.content
        }
      });
      res.status(201).json(msg);
    } catch (e) { next(e); }
  }

  static async updateTicketStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = await SupportService.updateTicketStatus(req.params.id, req.body.status);
      res.status(200).json(ticket);
    } catch (e) { next(e); }
  }
}
