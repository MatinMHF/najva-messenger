/**
 * Web Push transport (VAPID) — the fully-implemented, in-browser path.
 */
import webpush from 'web-push';
import { config } from '../../config';
import { PushPayload, PushResult } from './types';

let configured = false;

/** Configure VAPID once. Safe to call repeatedly. */
export function initWebPush(): boolean {
  if (configured) return true;
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    try {
      webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
      configured = true;
    } catch (e) {
      // Malformed keys must not crash boot/import — warn and leave push disabled.
      console.warn('[push] invalid VAPID keys — Web Push disabled:', (e as Error).message);
    }
  } else {
    console.warn('[push] VAPID keys not set — Web Push disabled');
  }
  return configured;
}

export const isWebPushConfigured = (): boolean => configured;

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function sendWebPush(sub: WebPushSubscription, payload: PushPayload): Promise<PushResult> {
  if (!configured) return { ok: false, gone: false };
  try {
    await webpush.sendNotification(sub as any, JSON.stringify(payload));
    return { ok: true, gone: false };
  } catch (e: any) {
    const code = e?.statusCode;
    // 404/410: subscription is gone — the caller should prune it.
    return { ok: false, gone: code === 404 || code === 410 };
  }
}
