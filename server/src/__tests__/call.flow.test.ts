import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { resetDb, registerFixture } from './helpers';

const app = createApp();
const sealedFor = (uid: string) => JSON.stringify({ v: 1, alg: 'sealbox', ct: `ck-${uid}` });

interface TestUser { id: string; token: string }
const registerUser = async (username: string): Promise<TestUser> => {
  const { body } = registerFixture(username);
  const res = await request(app).post('/api/auth/register').send(body);
  return { id: res.body.user.id, token: res.body.tokens.accessToken };
};
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const makeDM = async (a: TestUser, b: TestUser): Promise<string> => {
  const res = await request(app).post('/api/conversations/dm').set(auth(a)).send({
    targetUserId: b.id,
    wrappedKeys: [
      { userId: a.id, wrappedKey: sealedFor(a.id) },
      { userId: b.id, wrappedKey: sealedFor(b.id) },
    ],
  });
  return res.body.id;
};

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('POST /api/calls/:conversationId/grant', () => {
  it('issues a media-grant JWT + ICE servers to a member', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const dm = await makeDM(alice, bob);

    const res = await request(app).post(`/api/calls/${dm}/grant`).set(auth(alice));
    expect(res.status).toBe(200);
    expect(res.body.roomId).toBe(dm);
    expect(res.body.mediaServerUrl).toBeTruthy();

    // The token verifies with the shared media secret and binds userId + roomId.
    const claims = jwt.verify(res.body.token, config.mediaJwtSecret) as any;
    expect(claims.userId).toBe(alice.id);
    expect(claims.roomId).toBe(dm);

    // ICE: a STUN entry and a TURN entry with REST credentials.
    const turn = res.body.iceServers.find((s: any) => s.credential);
    expect(turn).toBeTruthy();
    const [expiry, uid] = String(turn.username).split(':');
    expect(uid).toBe(alice.id);
    expect(Number(expiry)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const expectedCred = crypto.createHmac('sha1', config.turnSecret).update(turn.username).digest('base64');
    expect(turn.credential).toBe(expectedCred);
  });

  it('forbids a non-member from getting a grant', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const dm = await makeDM(alice, bob);

    const res = await request(app).post(`/api/calls/${dm}/grant`).set(auth(carol));
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/calls/whatever/grant');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/calls/ice', () => {
  it('returns TURN REST credentials for the authenticated user', async () => {
    const alice = await registerUser('alice');
    const res = await request(app).get('/api/calls/ice').set(auth(alice));
    expect(res.status).toBe(200);
    const turn = res.body.iceServers.find((s: any) => s.credential);
    expect(String(turn.username).endsWith(`:${alice.id}`)).toBe(true);
  });
});
