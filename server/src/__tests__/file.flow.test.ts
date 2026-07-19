import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
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

// Stand-in for a client-encrypted blob (iv ‖ ciphertext). Opaque to the server.
const CIPHER_BLOB = Buffer.from('000000000000ENCRYPTEDBYTESNOTPLAINTEXT', 'utf8');
const THUMB_BLOB = Buffer.from('000000000000ENCRYPTEDTHUMB', 'utf8');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('attachments: upload stores opaque ciphertext', () => {
  it('persists the uploaded blob verbatim (no server-side transform) + an encrypted thumbnail', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    await makeDM(alice, bob);

    const up = await request(app)
      .post('/api/files/upload')
      .set(auth(alice))
      .field('encryptedKey', JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'x', ct: 'wrappedFK' }))
      .field('width', '640')
      .field('height', '480')
      .attach('file', CIPHER_BLOB, 'secret.enc')
      .attach('thumbnail', THUMB_BLOB, 'secret.thumb.enc');

    expect(up.status).toBe(201);
    expect(up.body.id).toBeTruthy();
    expect(up.body.thumbnailUrl).toBeTruthy();

    const att = await prisma.attachment.findUnique({ where: { id: up.body.id } });
    expect(att!.encryptedKey).toContain('wrappedFK');
    expect(att!.width).toBe(640);
    // On-disk bytes equal exactly what we uploaded — proving no plaintext transform.
    expect(fs.readFileSync(att!.filePath)).toEqual(CIPHER_BLOB);
    expect(fs.readFileSync(att!.thumbnailPath!)).toEqual(THUMB_BLOB);
  });
});

describe('attachments: download is membership-gated', () => {
  it('lets members download a linked attachment and forbids non-members + orphans', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const carol = await registerUser('carol');
    const dm = await makeDM(alice, bob);

    const up = await request(app)
      .post('/api/files/upload')
      .set(auth(alice))
      .field('encryptedKey', JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'x', ct: 'fk' }))
      .attach('file', CIPHER_BLOB, 'secret.enc');
    const attachmentId = up.body.id;

    // Orphan (not yet linked to a message) — inaccessible even to the uploader.
    expect((await request(app).get(`/api/files/${attachmentId}`).set(auth(alice))).status).toBe(403);

    // Link it by sending a FILE message that references it.
    await request(app).post(`/api/conversations/${dm}/messages`).set(auth(alice)).send({
      type: 'FILE', encryptedContent: 'c', iv: 'i', senderKeyVersion: 1, attachmentIds: [attachmentId],
    });

    expect((await request(app).get(`/api/files/${attachmentId}`).set(auth(alice))).status).toBe(200);
    expect((await request(app).get(`/api/files/${attachmentId}`).set(auth(bob))).status).toBe(200);
    expect((await request(app).get(`/api/files/${attachmentId}`).set(auth(carol))).status).toBe(403);
  });
});
