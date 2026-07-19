import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import { SenderType } from '@prisma/client';

export class SupportService {
  static async createTicket(username: string, message: string) {
    const sessionToken = uuidv4();
    const ticket = await prisma.supportTicket.create({
      data: {
        sessionToken,
        username,
        messages: {
          create: {
            senderType: 'USER' as SenderType,
            content: message
          }
        }
      },
      include: { messages: true }
    });
    return ticket;
  }

  static async getTicket(sessionToken: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { sessionToken },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
    if (!ticket) throw new AppError('Ticket not found', 404);
    return ticket;
  }

  static async addMessage(sessionToken: string, content: string, senderType: 'USER'|'ADMIN', senderId?: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { sessionToken } });
    if (!ticket) throw new AppError('Ticket not found', 404);

    return prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: senderType as SenderType,
        content,
        senderId
      }
    });
  }

  static async listTickets() {
    return prisma.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { assignedAdmin: { select: { username: true } } }
    });
  }

  static async updateTicketStatus(id: string, status: any) {
    return prisma.supportTicket.update({
      where: { id },
      data: { status }
    });
  }
}
