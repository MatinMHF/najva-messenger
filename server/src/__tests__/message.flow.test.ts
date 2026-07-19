import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';
import { resetDb, registerFixture } from './helpers';

const app = createApp();
const sealedFor = (uid: string) => JSON.stringify({ v: 1, alg: 'sealbox', ct: `ck-${uid}` });

interface TestUser { id: string; token: string; username: string }
const registerUser = async (username: string): Promise<TestUser> => {
  const { body } = registerFixture(username);
  const res = await request(app).post('/api/auth/register').send(body);
  return { id: res.body.user.id, token: res.body.tokens.accessToken, username };
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

const msgBody = (content: string) => ({
  type: 'TEXT', encryptedContent: content, iv: 'aXYtYmFzZTY0', senderKeyVersion: 1,
});

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('messaging: send / history', () => {
  it('a member sends and both can read history; ciphertext is stored verbatim', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const dm = await makeDM(alice, bob);

    const sent = await request(app).post(`/api/conversations/${dm}/messages`).set(auth(alice)).send(msgBody('CIPHERTEXT-1'));
    expect(sent.status).toBe(201);
    expect(sent.body.senderKeyVersion).toBe(1);

    const stored = await prisma.message.findUnique({ where: { id: sent.body.id } });
    expect(stored!.encryptedContent).toBe('CIPHERTEXT-1'); // opaque, unmodified

    const history = await request(app).get(`/api/conversations/${dm}/messages`).set(auth(bob));
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].encryptedContent).toBe('CIPHERTEXT-1');
  });

  it('a non-member cannot send or read', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const dm = await makeDM(alice, bob);

    const send = await request(app).post(`/api/conversations/${dm}/messages`).set(auth(carol)).send(msgBody('X'));
    expect(send.status).toBe(403);
    const read = await request(app).get(`/api/conversations/${dm}/messages`).set(auth(carol));
    expect(read.status).toBe(403);
  });
});

describe('messaging: edit / delete', () => {
  it('sender edits content + iv; non-sender is forbidden', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const dm = await makeDM(alice, bob);
    const sent = await request(app).post(`/api/conversations/${dm}/messages`).set(auth(alice)).send(msgBody('ORIG'));

    const edit = await request(app).put(`/api/messages/${sent.body.id}`).set(auth(alice))
      .send({ encryptedContent: 'EDITED', iv: 'bmV3LWl2' });
    expect(edit.status).toBe(200);
    const stored = await prisma.message.findUnique({ where: { id: sent.body.id } });
    expect(stored!.encryptedContent).toBe('EDITED');
    expect(stored!.iv).toBe('bmV3LWl2');

    const badEdit = await request(app).put(`/api/messages/${sent.body.id}`).set(auth(bob))
      .send({ encryptedContent: 'HACK' });
    expect(badEdit.status).toBe(403);
  });

  it('sender deletes; the message is soft-deleted and excluded from history', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const dm = await makeDM(alice, bob);
    const sent = await request(app).post(`/api/conversations/${dm}/messages`).set(auth(alice)).send(msgBody('BYE'));

    const del = await request(app).delete(`/api/messages/${sent.body.id}`).set(auth(alice));
    expect(del.status).toBe(200);
    const stored = await prisma.message.findUnique({ where: { id: sent.body.id } });
    expect(stored!.deletedAt).not.toBeNull();

    const history = await request(app).get(`/api/conversations/${dm}/messages`).set(auth(bob));
    expect(history.body).toHaveLength(0);
  });
});

describe('messaging: forward (re-encrypted under target CK)', () => {
  it('creates an isForwarded message in the target with the client-supplied re-encryption', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const dmAB = await makeDM(alice, bob);
    const dmAC = await makeDM(alice, carol);

    const src = await request(app).post(`/api/conversations/${dmAB}/messages`).set(auth(alice)).send(msgBody('SRC'));

    // Alice re-encrypts under dmAC's CK client-side; server just stores it.
    const fwd = await request(app).post(`/api/messages/${src.body.id}/forward`).set(auth(alice)).send({
      targetConversationId: dmAC,
      type: 'TEXT', encryptedContent: 'REENCRYPTED-FOR-AC', iv: 'aXYtMg', senderKeyVersion: 1,
    });
    expect(fwd.status).toBe(201);
    expect(fwd.body.isForwarded).toBe(true);
    expect(fwd.body.encryptedContent).toBe('REENCRYPTED-FOR-AC');
    expect(fwd.body.conversationId).toBe(dmAC);
  });

  it('forbids forwarding into a conversation the user is not a member of', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const dave = await registerUser('dave');
    const dmAB = await makeDM(alice, bob);
    const dmCD = await makeDM(carol, dave);
    const src = await request(app).post(`/api/conversations/${dmAB}/messages`).set(auth(alice)).send(msgBody('SRC'));

    const fwd = await request(app).post(`/api/messages/${src.body.id}/forward`).set(auth(alice)).send({
      targetConversationId: dmCD, type: 'TEXT', encryptedContent: 'X', iv: 'YQ', senderKeyVersion: 1,
    });
    expect(fwd.status).toBe(403);
  });
});
