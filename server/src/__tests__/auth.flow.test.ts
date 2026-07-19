import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';
import { buildAccountMaterial } from '../utils/accountCrypto';
import { resetDb, registerFixture, refreshCookie } from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('creates the user, recovery codes, saved-messages key and a session', async () => {
    const { body } = registerFixture('alice');
    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'alice', displayName: 'alice' });
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.tokens.accessToken).toBeTruthy();
    // refresh token is delivered as an httpOnly cookie, not in the body
    expect(refreshCookie(res)).toBeTruthy();
    expect(res.body.tokens?.refreshToken).toBeUndefined();

    const user = await prisma.user.findUnique({ where: { username: 'alice' } });
    expect(user).toBeTruthy();
    expect(user!.passwordHash).toBeTruthy();
    expect(user!.passwordHash).not.toBe(body.loginKey); // bcrypt(loginKey), not the raw loginKey
    expect(user!.kekSalt).toBe(body.kekSalt);
    expect(user!.identityKeyPublic).toBe(body.identityKeyPublic);

    const codes = await prisma.recoveryCode.count({ where: { userId: user!.id } });
    expect(codes).toBe(8);

    const saved = await prisma.conversation.findFirst({
      where: { type: 'SAVED_MESSAGES', createdById: user!.id },
      include: { keys: true, members: true },
    });
    expect(saved).toBeTruthy();
    expect(saved!.keys).toHaveLength(1);
    expect(saved!.keys[0].version).toBe(1);
    expect(saved!.members).toHaveLength(1);

    const sessions = await prisma.session.count({ where: { userId: user!.id } });
    expect(sessions).toBe(1);
  });

  it('rejects a duplicate username', async () => {
    const { body } = registerFixture('dup');
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(registerFixture('dup').body);
    expect(res.status).toBe(400);
  });

  it('rejects a recoveryCodes array with the wrong count (must be exactly 8)', async () => {
    const { body } = registerFixture('shortcodes');
    const tooFew = { ...body, recoveryCodes: (body.recoveryCodes as unknown[]).slice(0, 3) };
    const res = await request(app).post('/api/auth/register').send(tooFew);
    expect(res.status).toBe(400);

    const user = await prisma.user.findUnique({ where: { username: 'shortcodes' } });
    expect(user).toBeNull();
  });
});

describe('GET /api/auth/params (enumeration resistance)', () => {
  it('returns the real KDF params for a known user', async () => {
    const { body } = registerFixture('known');
    await request(app).post('/api/auth/register').send(body);

    const res = await request(app).get('/api/auth/params').query({ username: 'known' });
    expect(res.status).toBe(200);
    expect(res.body.kekSalt).toBe(body.kekSalt);
    expect(res.body.kekIterations).toBe(600000);
  });

  it('returns a deterministic fake salt for unknown users, same shape', async () => {
    const a1 = await request(app).get('/api/auth/params').query({ username: 'ghost' });
    const a2 = await request(app).get('/api/auth/params').query({ username: 'ghost' });
    const b = await request(app).get('/api/auth/params').query({ username: 'phantom' });

    expect(a1.status).toBe(200);
    expect(Object.keys(a1.body).sort()).toEqual(['kekIterations', 'kekSalt']);
    // deterministic per username
    expect(a1.body.kekSalt).toBe(a2.body.kekSalt);
    // differs across usernames (no fixed sentinel)
    expect(a1.body.kekSalt).not.toBe(b.body.kekSalt);
    expect(a1.body.kekIterations).toBe(600000);
  });

  it('does not reveal existence: known and unknown share the same response shape', async () => {
    const { body } = registerFixture('realuser');
    await request(app).post('/api/auth/register').send(body);
    const known = await request(app).get('/api/auth/params').query({ username: 'realuser' });
    const unknown = await request(app).get('/api/auth/params').query({ username: 'nobody-home' });
    expect(known.status).toBe(unknown.status);
    expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).sort());
  });
});

describe('POST /api/auth/login', () => {
  it('rejects a wrong loginKey with 401', async () => {
    const { body } = registerFixture('carol');
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'carol', loginKey: 'f'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown username with 401 (generic)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', loginKey: 'f'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('logs in with the correct loginKey and returns wrapped key material', async () => {
    const { body, loginKey } = registerFixture('dave');
    await request(app).post('/api/auth/register').send(body);

    const res = await request(app).post('/api/auth/login').send({ username: 'dave', loginKey });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(refreshCookie(res)).toBeTruthy();
    expect(res.body.mkPasswordWrapped).toBe(body.mkPasswordWrapped);
    expect(res.body.encryptedPrivateKeys).toBe(body.encryptedPrivateKeys);
    expect(res.body.kekSalt).toBe(body.kekSalt);
    expect(res.body.kekIterations).toBe(600000);

    const user = await prisma.user.findUnique({ where: { username: 'dave' } });
    const sessions = await prisma.session.count({ where: { userId: user!.id } });
    expect(sessions).toBe(2); // one from register, one from login
  });
});

describe('seed-provisioned account (accountCrypto.buildAccountMaterial)', () => {
  it('a server-provisioned account can log in with its derived loginKey', async () => {
    // Mirrors server/prisma/seed.ts: build real E2EE material server-side and
    // store bcrypt(loginKey). Proves the seed path yields a loginable account
    // and that accountCrypto stays byte-compatible with the login expectations.
    const material = buildAccountMaterial('admin123');
    await prisma.user.create({
      data: {
        username: 'seeded-admin',
        displayName: 'Seeded Admin',
        passwordHash: await bcrypt.hash(material.loginKeyHex, 12),
        kekSalt: material.kekSalt,
        kekIterations: material.kekIterations,
        mkPasswordWrapped: material.mkPasswordWrapped,
        encryptedPrivateKeys: material.encryptedPrivateKeys,
        identityKeyPublic: material.identityKeyPublic,
        identitySigningPublic: material.identitySigningPublic,
      },
    });

    // The client would fetch these params, re-derive the same loginKey.
    const params = await request(app).get('/api/auth/params').query({ username: 'seeded-admin' });
    expect(params.body.kekSalt).toBe(material.kekSalt);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'seeded-admin', loginKey: material.loginKeyHex });
    expect(res.status).toBe(200);
    expect(res.body.mkPasswordWrapped).toBe(material.mkPasswordWrapped);
    expect(res.body.kekSalt).toBe(material.kekSalt);
  });

  it('an account with no KEK material fails login cleanly (generic 401)', async () => {
    // najva-support style: a random unusable hash, no kekSalt.
    await prisma.user.create({
      data: {
        username: 'no-crypto-bot',
        displayName: 'Bot',
        passwordHash: await bcrypt.hash('whatever', 12),
      },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'no-crypto-bot', loginKey: 'f'.repeat(64) });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh (rotation + reuse revocation)', () => {
  const registerAndLogin = async (username: string) => {
    const { body, loginKey } = registerFixture(username);
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/login').send({ username, loginKey });
    return { access: res.body.tokens.accessToken as string, cookie: refreshCookie(res)! };
  };

  it('rotates the refresh token on each use', async () => {
    const { cookie: c0 } = await registerAndLogin('rot');
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c0);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTruthy();
    const c1 = refreshCookie(r1)!;
    expect(c1).not.toBe(c0);

    const r2 = await request(app).post('/api/auth/refresh').set('Cookie', c1);
    expect(r2.status).toBe(200);
  });

  it('detects reuse of a rotated token and revokes the whole session', async () => {
    const { cookie: c0 } = await registerAndLogin('reuse');
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c0);
    const c1 = refreshCookie(r1)!;

    // Replay the already-rotated token c0 → reuse detected
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', c0);
    expect(replay.status).toBe(401);

    // The session is now revoked: even the legitimate c1 no longer works
    const after = await request(app).post('/api/auth/refresh').set('Cookie', c1);
    expect(after.status).toBe(401);
  });

  it('detects reuse of the original (gen-0) token after 2+ rotations and revokes the session', async () => {
    const { cookie: c0 } = await registerAndLogin('reuse2gen');
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c0);
    const c1 = refreshCookie(r1)!;
    const r2 = await request(app).post('/api/auth/refresh').set('Cookie', c1);
    const c2 = refreshCookie(r2)!;

    // c0 is now 2 generations stale — matches neither refreshTokenHash nor
    // prevTokenHash — but the session is still valid/non-revoked.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', c0);
    expect(replay.status).toBe(401);

    // The session must be revoked as a result: even the current token fails.
    const after = await request(app).post('/api/auth/refresh').set('Cookie', c2);
    expect(after.status).toBe(401);
  });
});

describe('sessions management', () => {
  const registerAndLogin = async (username: string) => {
    const { body, loginKey } = registerFixture(username);
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/login').send({ username, loginKey });
    return { access: res.body.tokens.accessToken as string, cookie: refreshCookie(res)! };
  };

  it('lists active sessions and flags the current one', async () => {
    const { access } = await registerAndLogin('lister');
    const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${access}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    const current = res.body.sessions.filter((s: any) => s.current);
    expect(current).toHaveLength(1);
  });

  it('revokes a session; its refresh token stops working', async () => {
    const { access, cookie } = await registerAndLogin('revoker');
    const list = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${access}`);
    const current = list.body.sessions.find((s: any) => s.current);
    expect(current).toBeTruthy();

    const del = await request(app)
      .delete(`/api/auth/sessions/${current.id}`)
      .set('Authorization', `Bearer ${access}`);
    expect(del.status).toBe(200);

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });
});
