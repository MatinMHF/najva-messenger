import { prisma } from '../utils/prisma';
import { config } from '../config';
import { initWebPush, sendWebPush, WebPushSubscription } from './push/webpush.transport';
import { sendToDevice } from './push/native.transport';
import { PushPayload } from './push/types';

initWebPush();

const VALID_PLATFORMS = new Set(['android', 'ios', 'windows']);

export class NotificationService {
  static getVapidPublicKey(): string {
    return config.vapidPublicKey;
  }

  /** Store/update a browser Web Push subscription (idempotent per endpoint). */
  static async subscribeWebPush(userId: string, sub: WebPushSubscription) {
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw Object.assign(new Error('Invalid push subscription'), { statusCode: 400 });
    }
    return prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  }

  static async unsubscribeWebPush(userId: string, endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { success: true };
  }

  /** Register a native device token (FCM/APNs/Windows). */
  static async registerDevice(userId: string, platform: string, token: string) {
    if (!VALID_PLATFORMS.has(platform) || !token) {
      throw Object.assign(new Error('Invalid device registration'), { statusCode: 400 });
    }
    return prisma.pushDevice.upsert({
      where: { token },
      create: { userId, platform, token },
      update: { userId, platform },
    });
  }

  static async list(userId: string) {
    return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  static async markRead(userId: string, ids?: string[]) {
    await prisma.notification.updateMany({
      where: { userId, ...(ids && ids.length ? { id: { in: ids } } : {}), readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  /**
   * Fan out a notification to all of a user's push targets. Records a
   * Notification row (metadata only), sends over every Web Push subscription and
   * native device, and prunes dead endpoints/tokens. The PAYLOAD MUST BE
   * METADATA ONLY — callers pass a sender display name + ids, never message text.
   */
  static async dispatch(userId: string, payload: PushPayload): Promise<void> {
    await prisma.notification.create({
      data: { userId, kind: payload.kind, conversationId: payload.conversationId, actorId: payload.actorId },
    });

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    for (const s of subs) {
      const res = await sendWebPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      if (res.gone) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    }

    const devices = await prisma.pushDevice.findMany({ where: { userId } });
    for (const d of devices) {
      const res = await sendToDevice(d.platform, d.token, payload);
      if (res.gone) await prisma.pushDevice.delete({ where: { id: d.id } }).catch(() => {});
    }
  }
}
