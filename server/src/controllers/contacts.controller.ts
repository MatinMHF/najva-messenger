import { Request, Response, NextFunction } from 'express';
import { ContactsService } from '../services/contacts.service';

/**
 * Contacts controller — backed by the Contact Prisma model.
 */
export class ContactsController {
  static async list(req: any, res: Response, next: NextFunction) {
    try {
      const contacts = await ContactsService.listContacts(req.user.id);
      res.status(200).json(contacts);
    } catch (e) { next(e); }
  }

  static async add(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ContactsService.addContact(req.user.id, req.params.userId);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }

  static async remove(req: any, res: Response, next: NextFunction) {
    try {
      const result = await ContactsService.removeContact(req.user.id, req.params.userId);
      res.status(200).json(result);
    } catch (e) { next(e); }
  }
}
