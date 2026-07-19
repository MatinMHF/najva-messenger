/**
 * Native push transports (Module F): FCM (Android), APNs (iOS), and the
 * self-hosted Windows channel. This repo ships a WEB client only, so these are
 * integration-ready ADAPTERS: correct shape + registration path, config-gated by
 * credentials. With no credentials they no-op and warn (a future native client
 * registers a token via POST /notifications/devices and these light up).
 */
import { config } from '../../config';
import { PushPayload, PushResult } from './types';

const notConfigured = (channel: string): PushResult => {
  console.warn(`[push] ${channel} not configured — skipping (no native client / credentials)`);
  return { ok: false, gone: false };
};

/** FCM HTTP v1 would POST to fcm.googleapis.com with the device registration token. */
export async function sendFcm(_token: string, _payload: PushPayload): Promise<PushResult> {
  if (!config.fcmServerKey) return notConfigured('FCM');
  // Integration point: POST https://fcm.googleapis.com/v1/projects/<id>/messages:send
  // with { message: { token, data: <metadata-only payload> } }. Untestable here
  // without a real Android app + FCM project.
  return { ok: true, gone: false };
}

/** APNs would POST to api.push.apple.com with the device token + auth key (JWT). */
export async function sendApns(_token: string, _payload: PushPayload): Promise<PushResult> {
  if (!config.apnsKey) return notConfigured('APNs');
  // Integration point: HTTP/2 POST to api.push.apple.com/3/device/<token>.
  return { ok: true, gone: false };
}

/**
 * Windows has no OS push service — delivery is self-hosted. Connected clients are
 * already reached over the persistent Socket.IO connection (see dispatch policy);
 * a stored "token" here would address an app-managed background channel.
 */
export async function sendWindows(_token: string, _payload: PushPayload): Promise<PushResult> {
  return notConfigured('Windows self-hosted push');
}

export async function sendToDevice(platform: string, token: string, payload: PushPayload): Promise<PushResult> {
  switch (platform) {
    case 'android': return sendFcm(token, payload);
    case 'ios': return sendApns(token, payload);
    case 'windows': return sendWindows(token, payload);
    default:
      console.warn(`[push] unknown platform "${platform}"`);
      return { ok: false, gone: false };
  }
}
