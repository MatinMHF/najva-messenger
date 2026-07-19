import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';
import { resetDb, registerFixture } from './helpers';

// Mock web-push so no real network happens; control ok/gone per test.
const sendNotification = vi.fn();
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...a: any[]) => sendNotification(...a) },
}));

const app = createApp();
interface TestUser { id: string; token: string }
const registerUser = async (username: string): Promise<TestUser> => {
  const { body } = registerFixture(username);
  const res = await request(app).post('/api/auth/register').send(body);
  return { id: res.body.user.id, token: res.body.tokens.accessToken };
};
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const webSub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });

beforeEach(async () => { await resetDb(); sendNotification.mockReset(); sendNotification.mockResolvedValue({}); });
afterAll(async () => { await prisma.$disconnect(); });

describe('GET /api/notifications/vapid', () => {
  it('exposes the VAPID public key without auth', async () => {
    const res = await request(app).get('/api/notifications/vapid');
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('test-vapid-public');
  });
});

describe('subscription + device registration', () => {
  it('stores a Web Push subscription (idempotent by endpoint)', async () => {
    const alice = await registerUser('alice');
    const r1 = await request(app).post('/api/notifications/subscribe').set(auth(alice)).send({ subscription: webSub('https://push.example/a') });
    expect(r1.status).toBe(201);
    // Re-subscribing the same endpoint updates rather than duplicates.
    await request(app).post('/api/notifications/subscribe').set(auth(alice)).send({ subscription: webSub('https://push.example/a') });
    expect(await prisma.pushSubscription.count({ where: { userId: alice.id } })).toBe(1);
  });

  it('registers a native device token and rejects an unknown platform', async () => {
    const alice = await registerUser('alice');
    const ok = await request(app).post('/api/notifications/devices').set(auth(alice)).send({ platform: 'android', token: 'fcm-token-1' });
    expect(ok.status).toBe(201);
    expect(await prisma.pushDevice.count({ where: { userId: alice.id, platform: 'android' } })).toBe(1);

    const bad = await request(app).post('/api/notifications/devices').set(auth(alice)).send({ platform: 'symbian', token: 't' });
    expect(bad.status).toBe(400);
  });

  it('requires auth to subscribe', async () => {
    const res = await request(app).post('/api/notifications/subscribe').send({ subscription: webSub('x') });
    expect(res.status).toBe(401);
  });
});

describe('dispatch', () => {
  it('records a Notification row and sends metadata-only Web Push (no plaintext)', async () => {
    const alice = await registerUser('alice');
    await request(app).post('/api/notifications/subscribe').set(auth(alice)).send({ subscription: webSub('https://push.example/a') });

    const { NotificationService } = await import('../services/notification.service');
    await NotificationService.dispatch(alice.id, { title: 'Bob', body: 'new_message', kind: 'message', conversationId: 'conv-1', actorId: 'bob-id' });

    // A Notification row exists, and it stores NO message content.
    const rows = await prisma.notification.findMany({ where: { userId: alice.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('message');
    expect(JSON.stringify(rows[0])).not.toContain('SECRET_MESSAGE_TEXT');

    // Web Push was sent with a metadata-only payload.
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: 'Bob', kind: 'message', conversationId: 'conv-1' });
    expect(JSON.stringify(payload)).not.toMatch(/SECRET_MESSAGE_TEXT/);
  });

  it('prunes a subscription the push service reports as gone (410)', async () => {
    const alice = await registerUser('alice');
    await request(app).post('/api/notifications/subscribe').set(auth(alice)).send({ subscription: webSub('https://push.example/dead') });
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));

    const { NotificationService } = await import('../services/notification.service');
    await NotificationService.dispatch(alice.id, { title: 'Bob', body: 'new_message', kind: 'message' });

    expect(await prisma.pushSubscription.count({ where: { userId: alice.id } })).toBe(0);
  });
});
