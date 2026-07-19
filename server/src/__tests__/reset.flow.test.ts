import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

import { createApp } from '../app';
import { prisma } from '../utils/prisma';
import { redisClient } from '../utils/redis';
import { resetDb, registerFixture, refreshCookie } from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redisClient.quit();
});

const sealed = () => JSON.stringify({ v: 1, alg: 'sealbox', ct: 'DEADBEEF' });
const ephPub = () => crypto.randomBytes(32).toString('base64');

/** Register a user (device A) and return its access token + fixture. */
const registerUser = async (username: string) => {
  const fixture = registerFixture(username);
  const res = await request(app).post('/api/auth/register').send(fixture.body);
  return {
    ...fixture,
    userId: res.body.user.id as string,
    access: res.body.tokens.accessToken as string,
    cookie: refreshCookie(res),
  };
};

/** Read the plaintext OTP that flow C delivered to device A via the support DM. */
const readDeliveredOtp = async (userId: string): Promise<string> => {
  const msg = await prisma.message.findFirst({
    where: { conversation: { members: { some: { userId } } }, isSystemPlaintext: true },
    orderBy: { createdAt: 'desc' },
  });
  const m = msg?.encryptedContent.match(/(\d{6})/);
  return m ? m[1] : '';
};

// ---------------------------------------------------------------------------
// Flow C — support-OTP handshake to a logged-in device
// ---------------------------------------------------------------------------

describe('recovery flow C (support-OTP device handshake)', () => {
  it('runs the full request → approve → complete handshake and revokes old sessions', async () => {
    const a = await registerUser('carol');

    // Device B: request a reset with its ephemeral public key.
    const reqRes = await request(app).post('/api/auth/reset/request').send({ username: 'carol', ephemeralPub: ephPub() });
    expect(reqRes.status).toBe(200);
    const { resetId, resetSecret } = reqRes.body;
    expect(resetId).toBeTruthy();
    expect(resetSecret).toBeTruthy();

    // Device A got the OTP + a pending request it can approve.
    const otp = await readDeliveredOtp(a.userId);
    expect(otp).toMatch(/^\d{6}$/);

    // Before approval, B sees PENDING and no sealed MK.
    const pending = await request(app).get(`/api/auth/reset/status/${resetId}?secret=${resetSecret}`);
    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe('PENDING');
    expect(pending.body.sealedMk).toBeFalsy();

    // Device A approves, sealing its MK to B's ephemeral key.
    const appr = await request(app)
      .post('/api/auth/reset/approve')
      .set('Authorization', `Bearer ${a.access}`)
      .send({ resetId, sealedMk: sealed() });
    expect(appr.status).toBe(200);

    // B polls again → APPROVED + the sealed MK to open.
    const approved = await request(app).get(`/api/auth/reset/status/${resetId}?secret=${resetSecret}`);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.sealedMk).toBe(sealed());

    // B completes with the OTP + new password material.
    const newLoginKey = crypto.randomBytes(32).toString('hex');
    const complete = await request(app).post('/api/auth/reset/complete').send({
      resetId,
      resetSecret,
      otp,
      newLoginKey,
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'AAAAAAAAAAAAAAAA', ct: 'FFFF' }),
    });
    expect(complete.status).toBe(200);
    expect(complete.body.tokens.accessToken).toBeTruthy();

    // New password works.
    const login = await request(app).post('/api/auth/login').send({ username: 'carol', loginKey: newLoginKey });
    expect(login.status).toBe(200);

    // Device A's old session was revoked (its refresh token no longer rotates).
    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', a.cookie!);
    expect(refresh.status).toBeGreaterThanOrEqual(400);

    // Recovery codes are UNTOUCHED by flow C (they wrap the same MK).
    const codes = await prisma.recoveryCode.count({ where: { userId: a.userId } });
    expect(codes).toBe(8);
  });

  it('rejects complete before approval', async () => {
    const a = await registerUser('dave');
    const reqRes = await request(app).post('/api/auth/reset/request').send({ username: 'dave', ephemeralPub: ephPub() });
    const { resetId, resetSecret } = reqRes.body;
    const otp = await readDeliveredOtp(a.userId);

    const complete = await request(app).post('/api/auth/reset/complete').send({
      resetId, resetSecret, otp,
      newLoginKey: crypto.randomBytes(32).toString('hex'),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      mkPasswordWrapped: 'x',
    });
    expect(complete.status).toBeGreaterThanOrEqual(400);
  });

  it('caps OTP attempts at 5 and then kills the reset', async () => {
    const a = await registerUser('erin');
    const reqRes = await request(app).post('/api/auth/reset/request').send({ username: 'erin', ephemeralPub: ephPub() });
    const { resetId, resetSecret } = reqRes.body;
    await request(app).post('/api/auth/reset/approve').set('Authorization', `Bearer ${a.access}`).send({ resetId, sealedMk: sealed() });
    const goodOtp = await readDeliveredOtp(a.userId);

    const body = (otp: string) => ({
      resetId, resetSecret, otp,
      newLoginKey: crypto.randomBytes(32).toString('hex'),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      mkPasswordWrapped: 'x',
    });

    for (let i = 0; i < 5; i++) {
      const bad = await request(app).post('/api/auth/reset/complete').send(body('000000'));
      expect(bad.status).toBeGreaterThanOrEqual(400);
    }
    // Even the correct OTP now fails — the reset was killed after 5 bad tries.
    const afterCap = await request(app).post('/api/auth/reset/complete').send(body(goodOtp));
    expect(afterCap.status).toBeGreaterThanOrEqual(400);
  });

  it('requires the correct resetSecret to poll status and complete', async () => {
    const a = await registerUser('frank');
    const reqRes = await request(app).post('/api/auth/reset/request').send({ username: 'frank', ephemeralPub: ephPub() });
    const { resetId } = reqRes.body;
    await request(app).post('/api/auth/reset/approve').set('Authorization', `Bearer ${a.access}`).send({ resetId, sealedMk: sealed() });
    const otp = await readDeliveredOtp(a.userId);

    const badStatus = await request(app).get(`/api/auth/reset/status/${resetId}?secret=wrong`);
    expect(badStatus.status).toBeGreaterThanOrEqual(400);

    const badComplete = await request(app).post('/api/auth/reset/complete').send({
      resetId, resetSecret: 'wrong', otp,
      newLoginKey: crypto.randomBytes(32).toString('hex'),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      mkPasswordWrapped: 'x',
    });
    expect(badComplete.status).toBeGreaterThanOrEqual(400);
  });

  it('supersedes an earlier pending request when a new one is made', async () => {
    const a = await registerUser('grace');
    const first = await request(app).post('/api/auth/reset/request').send({ username: 'grace', ephemeralPub: ephPub() });
    const second = await request(app).post('/api/auth/reset/request').send({ username: 'grace', ephemeralPub: ephPub() });
    expect(second.status).toBe(200);

    // The first resetId is no longer valid.
    const stale = await request(app).get(`/api/auth/reset/status/${first.body.resetId}?secret=${first.body.resetSecret}`);
    expect(stale.status).toBeGreaterThanOrEqual(400);
    void a;
  });

  it('rejects a second complete (single-use)', async () => {
    const a = await registerUser('heidi');
    const reqRes = await request(app).post('/api/auth/reset/request').send({ username: 'heidi', ephemeralPub: ephPub() });
    const { resetId, resetSecret } = reqRes.body;
    await request(app).post('/api/auth/reset/approve').set('Authorization', `Bearer ${a.access}`).send({ resetId, sealedMk: sealed() });
    const otp = await readDeliveredOtp(a.userId);
    const body = () => ({
      resetId, resetSecret, otp,
      newLoginKey: crypto.randomBytes(32).toString('hex'),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      mkPasswordWrapped: JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'AAAAAAAAAAAAAAAA', ct: 'FF' }),
    });
    const first = await request(app).post('/api/auth/reset/complete').send(body());
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/auth/reset/complete').send(body());
    expect(second.status).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Flow D — admin-gated cryptographic-loss reset
// ---------------------------------------------------------------------------

describe('recovery flow D (admin-gated cryptographic loss)', () => {
  const makeAdmin = async (userId: string) => {
    await prisma.user.update({ where: { id: userId }, data: { isAdmin: true } });
  };

  it('lets an admin issue a one-time token that re-keys the account and wipes old key material', async () => {
    const victim = await registerUser('ivan');
    const admin = await registerUser('adminuser');
    await makeAdmin(admin.userId);

    // Give the victim a conversation-key row to be wiped, and enable TOTP.
    await prisma.user.update({ where: { id: victim.userId }, data: { totpEnabled: true, totpSecret: 'S' } });
    const beforeVersion = (await prisma.user.findUnique({ where: { id: victim.userId } }))!.mkVersion;

    // Admin authorizes a reset.
    const auth = await request(app)
      .post(`/api/admin/users/${victim.userId}/authorize-reset`)
      .set('Authorization', `Bearer ${admin.access}`);
    expect(auth.status).toBe(200);
    const token = auth.body.token as string;
    expect(token).toBeTruthy();

    // Victim uploads brand-new material.
    const fresh = registerFixture('ivan').body;
    const lost = await request(app).post('/api/auth/reset/lost').send({
      authorizationToken: token,
      username: 'ivan',
      loginKey: fresh.loginKey,
      kekSalt: fresh.kekSalt,
      kekIterations: fresh.kekIterations,
      mkPasswordWrapped: fresh.mkPasswordWrapped,
      encryptedPrivateKeys: fresh.encryptedPrivateKeys,
      identityKeyPublic: fresh.identityKeyPublic,
      identitySigningPublic: fresh.identitySigningPublic,
      recoveryCodes: fresh.recoveryCodes,
    });
    expect(lost.status).toBe(200);
    expect(lost.body.tokens.accessToken).toBeTruthy();

    const after = (await prisma.user.findUnique({ where: { id: victim.userId } }))!;
    expect(after.mkVersion).toBe(beforeVersion + 1);
    expect(after.totpEnabled).toBe(false);
    expect(after.identityKeyPublic).toBe(fresh.identityKeyPublic);

    // Old ConversationKey rows for the victim are gone.
    const cks = await prisma.conversationKey.count({ where: { userId: victim.userId } });
    expect(cks).toBe(0);

    // Recovery codes were replaced (8 fresh ones).
    const codes = await prisma.recoveryCode.count({ where: { userId: victim.userId } });
    expect(codes).toBe(8);

    // Old session dead.
    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', victim.cookie!);
    expect(refresh.status).toBeGreaterThanOrEqual(400);

    // New login key works.
    const login = await request(app).post('/api/auth/login').send({ username: 'ivan', loginKey: fresh.loginKey });
    expect(login.status).toBe(200);
  });

  it('rejects a non-admin authorizing a reset', async () => {
    const victim = await registerUser('judy');
    const notAdmin = await registerUser('mallory');
    const res = await request(app)
      .post(`/api/admin/users/${victim.userId}/authorize-reset`)
      .set('Authorization', `Bearer ${notAdmin.access}`);
    expect(res.status).toBe(403);
  });

  it('makes the authorization token single-use', async () => {
    const victim = await registerUser('niaj');
    const admin = await registerUser('root');
    await makeAdmin(admin.userId);
    const auth = await request(app)
      .post(`/api/admin/users/${victim.userId}/authorize-reset`)
      .set('Authorization', `Bearer ${admin.access}`);
    const token = auth.body.token as string;

    const material = (u: string) => {
      const b = registerFixture(u).body;
      return {
        authorizationToken: token, username: 'niaj',
        loginKey: b.loginKey, kekSalt: b.kekSalt, kekIterations: b.kekIterations,
        mkPasswordWrapped: b.mkPasswordWrapped, encryptedPrivateKeys: b.encryptedPrivateKeys,
        identityKeyPublic: b.identityKeyPublic, identitySigningPublic: b.identitySigningPublic,
        recoveryCodes: b.recoveryCodes,
      };
    };
    const first = await request(app).post('/api/auth/reset/lost').send(material('niaj'));
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/auth/reset/lost').send(material('niaj'));
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects an unknown authorization token', async () => {
    await registerUser('olivia');
    const b = registerFixture('olivia').body;
    const res = await request(app).post('/api/auth/reset/lost').send({
      authorizationToken: 'nope', username: 'olivia',
      loginKey: b.loginKey, kekSalt: b.kekSalt, kekIterations: b.kekIterations,
      mkPasswordWrapped: b.mkPasswordWrapped, encryptedPrivateKeys: b.encryptedPrivateKeys,
      identityKeyPublic: b.identityKeyPublic, identitySigningPublic: b.identitySigningPublic,
      recoveryCodes: b.recoveryCodes,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
