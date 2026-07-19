import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export class ContactsService {
  static async listContacts(ownerId: string) {
    const contacts = await prisma.contact.findMany({
      where: { ownerId },
      include: {
        contact: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            status: true,
            lastSeen: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return contacts.map(c => ({ ...c.contact, alias: c.alias }));
  }

  static async addContact(ownerId: string, contactId: string) {
    if (ownerId === contactId) {
      throw new AppError('Cannot add yourself as a contact', 400);
    }

    const target = await prisma.user.findUnique({ where: { id: contactId } });
    if (!target) throw new AppError('User not found', 404);

    await prisma.contact.upsert({
      where: { ownerId_contactId: { ownerId, contactId } },
      update: {},
      create: { ownerId, contactId }
    });
    return { success: true };
  }

  static async removeContact(ownerId: string, contactId: string) {
    await prisma.contact.deleteMany({
      where: { ownerId, contactId }
    });
    return { success: true };
  }
}
