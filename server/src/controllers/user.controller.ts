import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
  static async searchUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query.q as string;
      const users = await UserService.searchUsers(q);
      res.status(200).json(users);
    } catch (e) { next(e); }
  }

  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.getUserProfile(req.params.id);
      res.status(200).json(user);
    } catch (e) { next(e); }
  }

  static async updateProfile(req: any, res: Response, next: NextFunction) {
    try {
      const user = await UserService.updateProfile(req.user.id, req.body);
      res.status(200).json(user);
    } catch (e) { next(e); }
  }

  static async updateSettings(req: any, res: Response, next: NextFunction) {
    try {
      const settings = await UserService.updateSettings(req.user.id, req.body);
      res.status(200).json(settings);
    } catch (e) { next(e); }
  }

  static async changePassword(req: any, res: Response, next: NextFunction) {
    try {
      const result = await UserService.changePassword(req.user.id, req.body);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }
}
