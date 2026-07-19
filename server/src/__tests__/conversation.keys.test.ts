import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';
import { resetDb, registerFixture } from './helpers';

/**
 * C1 — Conversation-Key (CK) distribution.
 * The server never generates or unwraps a CK: the client supplies sealed-box
 * wraps (opaque strings) per member. The server's job is share-set completeness,
 * membership/admin authorization, versioning, and rotation bookkeeping.
 */
const app = createApp();
const sealedFor = (uid: string) => JSON.stringify({ v: 1, alg: 'sealbox', ct: `ck-for-${uid}` });

interface TestUser { id: string; token: string; username: string }

const registerUser = async (username: string): Promise<TestUser> => {
  const { body } = registerFixture(username);
  const res = await request(app).post('/api/auth/register').send(body);
  expect(res.status).toBe(201);
  return { id: res.body.user.id, token: res.body.tokens.accessToken, username };
};

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/conversations/dm (create with CK)', () => {
  it('creates a DM and provisions one CK row per member at version 1', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const res = await request(app)
      .post('/api/conversations/dm')
      .set(auth(alice))
      .send({
        targetUserId: bob.id,
        wrappedKeys: [
          { userId: alice.id, wrappedKey: sealedFor(alice.id) },
          { userId: bob.id, wrappedKey: sealedFor(bob.id) },
        ],
      });

    expect(res.status).toBe(201);
    const keys = await prisma.conversationKey.findMany({ where: { conversationId: res.body.id } });
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.version === 1)).toBe(true);
    expect(keys.find((k) => k.userId === bob.id)!.wrappedKey).toBe(sealedFor(bob.id));
    expect(keys.every((k) => k.wrappedById === alice.id)).toBe(true);
  });

  it('rejects DM creation when a member wrappedKey is missing (incomplete share set)', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const res = await request(app)
      .post('/api/conversations/dm')
      .set(auth(alice))
      .send({ targetUserId: bob.id, wrappedKeys: [{ userId: alice.id, wrappedKey: sealedFor(alice.id) }] });

    expect(res.status).toBe(400);
    expect(await prisma.conversation.count()).toBe(2); // only the two SAVED_MESSAGES convs
  });

  it('is idempotent: a second create returns the existing DM without new CK rows', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const body = {
      targetUserId: bob.id,
      wrappedKeys: [
        { userId: alice.id, wrappedKey: sealedFor(alice.id) },
        { userId: bob.id, wrappedKey: sealedFor(bob.id) },
      ],
    };
    const first = await request(app).post('/api/conversations/dm').set(auth(alice)).send(body);
    const second = await request(app).post('/api/conversations/dm').set(auth(alice)).send(body);

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    const keys = await prisma.conversationKey.findMany({ where: { conversationId: first.body.id } });
    expect(keys).toHaveLength(2);
  });
});

describe('GET /api/conversations/:id/keys', () => {
  it("returns the caller's CK rows and forbids non-members", async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const dm = await request(app).post('/api/conversations/dm').set(auth(alice)).send({
      targetUserId: bob.id,
      wrappedKeys: [
        { userId: alice.id, wrappedKey: sealedFor(alice.id) },
        { userId: bob.id, wrappedKey: sealedFor(bob.id) },
      ],
    });

    const asBob = await request(app).get(`/api/conversations/${dm.body.id}/keys`).set(auth(bob));
    expect(asBob.status).toBe(200);
    expect(asBob.body).toHaveLength(1);
    expect(asBob.body[0]).toMatchObject({ version: 1, wrappedKey: sealedFor(bob.id) });

    const asCarol = await request(app).get(`/api/conversations/${dm.body.id}/keys`).set(auth(carol));
    expect(asCarol.status).toBe(403);
  });
});

describe('POST /api/conversations (group create with CK)', () => {
  it('creates a GROUP with a CK row for every member', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const res = await request(app).post('/api/conversations').set(auth(alice)).send({
      type: 'GROUP',
      name: 'Team',
      memberIds: [bob.id],
      wrappedKeys: [
        { userId: alice.id, wrappedKey: sealedFor(alice.id) },
        { userId: bob.id, wrappedKey: sealedFor(bob.id) },
      ],
    });

    expect(res.status).toBe(201);
    const keys = await prisma.conversationKey.findMany({ where: { conversationId: res.body.id } });
    expect(keys).toHaveLength(2);
    const creatorMember = await prisma.conversationMember.findFirst({
      where: { conversationId: res.body.id, userId: alice.id },
    });
    expect(creatorMember!.role).toBe('ADMIN');
  });

  it('rejects group create with an incomplete share set', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const res = await request(app).post('/api/conversations').set(auth(alice)).send({
      type: 'GROUP',
      name: 'Team',
      memberIds: [bob.id],
      wrappedKeys: [{ userId: alice.id, wrappedKey: sealedFor(alice.id) }],
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/conversations/:id/members (add with CK share)', () => {
  const makeGroup = async (alice: TestUser, bob: TestUser) =>
    request(app).post('/api/conversations').set(auth(alice)).send({
      type: 'GROUP',
      name: 'Team',
      memberIds: [bob.id],
      wrappedKeys: [
        { userId: alice.id, wrappedKey: sealedFor(alice.id) },
        { userId: bob.id, wrappedKey: sealedFor(bob.id) },
      ],
    });

  it('admin adds a member with a CK wrap at the current version', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const group = await makeGroup(alice, bob);

    const res = await request(app)
      .post(`/api/conversations/${group.body.id}/members`)
      .set(auth(alice))
      .send({ members: [{ userId: carol.id, wrappedKey: sealedFor(carol.id) }] });

    expect(res.status).toBe(200);
    const carolKey = await prisma.conversationKey.findFirst({
      where: { conversationId: group.body.id, userId: carol.id },
    });
    expect(carolKey).toMatchObject({ version: 1, wrappedKey: sealedFor(carol.id) });
  });

  it('rejects a non-admin add and an add without a wrappedKey', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const group = await makeGroup(alice, bob);

    const nonAdmin = await request(app)
      .post(`/api/conversations/${group.body.id}/members`)
      .set(auth(bob))
      .send({ members: [{ userId: carol.id, wrappedKey: sealedFor(carol.id) }] });
    expect(nonAdmin.status).toBe(403);

    const noKey = await request(app)
      .post(`/api/conversations/${group.body.id}/members`)
      .set(auth(alice))
      .send({ members: [{ userId: carol.id }] });
    expect(noKey.status).toBe(400);
  });
});

describe('DELETE /api/conversations/:id/members/:userId (remove + rotate CK)', () => {
  const makeTrio = async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const group = await request(app).post('/api/conversations').set(auth(alice)).send({
      type: 'GROUP',
      name: 'Team',
      memberIds: [bob.id, carol.id],
      wrappedKeys: [
        { userId: alice.id, wrappedKey: sealedFor(alice.id) },
        { userId: bob.id, wrappedKey: sealedFor(bob.id) },
        { userId: carol.id, wrappedKey: sealedFor(carol.id) },
      ],
    });
    return { alice, bob, carol, groupId: group.body.id as string };
  };

  it('removes a member and rotates the CK forward to the remaining members', async () => {
    const { alice, bob, carol, groupId } = await makeTrio();

    const res = await request(app)
      .delete(`/api/conversations/${groupId}/members/${bob.id}`)
      .set(auth(alice))
      .send({
        rotation: {
          keys: [
            { userId: alice.id, wrappedKey: 'v2-alice' },
            { userId: carol.id, wrappedKey: 'v2-carol' },
          ],
        },
      });

    expect(res.status).toBe(200);
    const conv = await prisma.conversation.findUnique({ where: { id: groupId } });
    expect(conv!.currentKeyVersion).toBe(2);

    const v2 = await prisma.conversationKey.findMany({ where: { conversationId: groupId, version: 2 } });
    expect(v2.map((k) => k.userId).sort()).toEqual([alice.id, carol.id].sort());

    const removed = await prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId: bob.id },
    });
    expect(removed!.isRemoved).toBe(true);
    // bob keeps his v1 wrap (honest: he already saw v1 history), gets no v2 wrap
    expect(await prisma.conversationKey.findFirst({ where: { conversationId: groupId, userId: bob.id, version: 2 } })).toBeNull();
  });

  it('rejects a rotation whose share set omits a remaining member', async () => {
    const { alice, bob, groupId } = await makeTrio();
    const res = await request(app)
      .delete(`/api/conversations/${groupId}/members/${bob.id}`)
      .set(auth(alice))
      .send({ rotation: { keys: [{ userId: alice.id, wrappedKey: 'v2-alice' }] } });
    expect(res.status).toBe(400);
    const conv = await prisma.conversation.findUnique({ where: { id: groupId } });
    expect(conv!.currentKeyVersion).toBe(1); // unchanged
  });

  it('rejects a non-admin remove', async () => {
    const { bob, carol, groupId } = await makeTrio();
    const res = await request(app)
      .delete(`/api/conversations/${groupId}/members/${carol.id}`)
      .set(auth(bob))
      .send({ rotation: { keys: [] } });
    expect(res.status).toBe(403);
  });
});
