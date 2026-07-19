import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';
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
const msg = { type: 'TEXT', encryptedContent: 'c', iv: 'i', senderKeyVersion: 1 };

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('channels', () => {
  const makeChannel = async (owner: TestUser, member: TestUser) =>
    request(app).post('/api/conversations').set(auth(owner)).send({
      type: 'CHANNEL',
      name: 'Announcements',
      memberIds: [member.id],
      wrappedKeys: [
        { userId: owner.id, wrappedKey: sealedFor(owner.id) },
        { userId: member.id, wrappedKey: sealedFor(member.id) },
      ],
    });

  it('creates a CHANNEL with the creator as ADMIN and provisions CKs', async () => {
    const owner = await registerUser('owner');
    const sub = await registerUser('sub');
    const res = await makeChannel(owner, sub);

    expect(res.status).toBe(201);
    const conv = await prisma.conversation.findUnique({ where: { id: res.body.id } });
    expect(conv!.type).toBe('CHANNEL');
    const keys = await prisma.conversationKey.count({ where: { conversationId: res.body.id } });
    expect(keys).toBe(2);
  });

  it('lets an admin post but forbids a non-admin member (read-only)', async () => {
    const owner = await registerUser('owner');
    const sub = await registerUser('sub');
    const ch = await makeChannel(owner, sub);

    const adminPost = await request(app).post(`/api/conversations/${ch.body.id}/messages`).set(auth(owner)).send(msg);
    expect(adminPost.status).toBe(201);

    const memberPost = await request(app).post(`/api/conversations/${ch.body.id}/messages`).set(auth(sub)).send(msg);
    expect(memberPost.status).toBe(403);

    // The member can still READ the channel history.
    const read = await request(app).get(`/api/conversations/${ch.body.id}/messages`).set(auth(sub));
    expect(read.status).toBe(200);
    expect(read.body).toHaveLength(1);
  });
});
