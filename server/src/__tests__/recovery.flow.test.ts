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

/** Register a user and return the fixture body (with known recovery verifiers). */
const register = async (username: string) => {
  const fixture = registerFixture(username);
  const res = await request(app).post('/api/auth/register').send(fixture.body);
  return { ...fixture, registerCookie: refreshCookie(res)! };
};

const login = async (username: string, loginKey: string) => {
  const res = await request(app).post('/api/auth/login').send({ username, loginKey });
  return { access: res.body.tokens.accessToken as string, cookie: refreshCookie(res)! };
};

// Fresh, valid-shaped material a client would upload after re-wrapping the MK.
const freshLoginKey = () => crypto.randomBytes(32).toString('hex');
const envelope = () => JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'AAAAAAAAAAAAAAAA', ct: 'DDDDDDDD' });

describe('POST /api/auth/recover/verify (flow A, timing-safe user-scoped lookup)', () => {
  it('returns wrapped material + a recovery token for a matching unused code', async () => {
    const { body } = await register('reca');
    const target = (body.recoveryCodes as any[])[2];

    const res = await request(app)
      .post('/api/auth/recover/verify')
      .send({ username: 'reca', verifierHash: target.verifierHash });

    expect(res.status).toBe(200);
    expect(res.body.wrappedMk).toBe(target.wrappedMk);
    expect(res.body.wrapSalt).toBe(target.wrapSalt);
    expect(res.body.encryptedPrivateKeys).toBe(body.encryptedPrivateKeys);
    expect(typeof res.body.recoveryToken).toBe('string');
    expect(res.body.recoveryToken.length).toBeGreaterThanOrEqual(32);
    // never echoes the verifier or exposes all codes
    expect(res.body.verifierHash).toBeUndefined();
  });

  it('rejects a wrong verifierHash with a generic error (no match)', async () => {
    await register('recb');
    const res = await request(app)
      .post('/api/auth/recover/verify')
      .send({ username: 'recb', verifierHash: crypto.randomBytes(32).toString('hex') });
    expect(res.status).toBe(401);
    expect(res.body.recoveryToken).toBeUndefined();
    expect(res.body.wrappedMk).toBeUndefined();
  });

  it('rejects an unknown username with the SAME generic error shape', async () => {
    const res = await request(app)
      .post('/api/auth/recover/verify')
      .send({ username: 'ghost-user', verifierHash: crypto.randomBytes(32).toString('hex') });
    expect(res.status).toBe(401);
    expect(res.body.recoveryToken).toBeUndefined();
  });

  it('does not treat a malformed (non-hex/short) verifier as a crash or match', async () => {
    await register('recmal');
    const res = await request(app)
      .post('/api/auth/recover/verify')
      .send({ username: 'recmal', verifierHash: 'not-a-hash' });
    expect(res.status).toBe(401);
  });

  it('rate-limits repeated verify attempts for the same username (strict)', async () => {
    await register('recrl');
    const wrong = () =>
      request(app)
        .post('/api/auth/recover/verify')
        .send({ username: 'recrl', verifierHash: crypto.randomBytes(32).toString('hex') });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await wrong();
      statuses.push(r.status);
    }
    // Some later attempts must be blocked (429) once the strict window is hit.
    expect(statuses).toContain(429);
  });
});

describe('POST /api/auth/recover/complete (flow A)', () => {
  const verify = async (username: string, verifierHash: string) => {
    const res = await request(app).post('/api/auth/recover/verify').send({ username, verifierHash });
    return res.body.recoveryToken as string;
  };

  it('swaps password material, marks the code used, revokes sessions, and disables TOTP', async () => {
    const { body, loginKey } = await register('recc');
    const user = await prisma.user.findUnique({ where: { username: 'recc' } });
    // Establish a live session first, THEN simulate enabled 2FA (so the login
    // above isn't gated by a TOTP prompt).
    const { cookie } = await login('recc', loginKey);
    await prisma.user.update({
      where: { id: user!.id },
      data: { totpEnabled: true, totpSecret: 'JBSWY3DPEHPK3PXP' },
    });

    const target = (body.recoveryCodes as any[])[0];
    const token = await verify('recc', target.verifierHash);
    expect(token).toBeTruthy();

    const newKey = freshLoginKey();
    const res = await request(app).post('/api/auth/recover/complete').send({
      recoveryToken: token,
      newLoginKey: newKey,
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: envelope(),
    });
    expect(res.status).toBe(200);

    // TOTP disabled
    const after = await prisma.user.findUnique({ where: { id: user!.id } });
    expect(after!.totpEnabled).toBe(false);
    expect(after!.totpSecret).toBeNull();

    // Code marked used
    const usedCode = await prisma.recoveryCode.findFirst({
      where: { userId: user!.id, verifierHash: target.verifierHash },
    });
    expect(usedCode!.usedAt).not.toBeNull();

    // Pre-existing session revoked
    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);

    // New loginKey works; old one rejected
    const good = await request(app).post('/api/auth/login').send({ username: 'recc', loginKey: newKey });
    expect(good.status).toBe(200);
    const old = await request(app).post('/api/auth/login').send({ username: 'recc', loginKey });
    expect(old.status).toBe(401);
  });

  it('marks the used code un-reusable (its verifier no longer verifies)', async () => {
    const { body } = await register('recd');
    const target = (body.recoveryCodes as any[])[1];
    const token = await verify('recd', target.verifierHash);
    await request(app).post('/api/auth/recover/complete').send({
      recoveryToken: token,
      newLoginKey: freshLoginKey(),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: envelope(),
    });
    // Same code can no longer be verified (it's used).
    const reverify = await request(app)
      .post('/api/auth/recover/verify')
      .send({ username: 'recd', verifierHash: target.verifierHash });
    expect(reverify.status).toBe(401);
  });

  it('rejects a recovery token that has already been used (single-use)', async () => {
    const { body } = await register('rece');
    const target = (body.recoveryCodes as any[])[3];
    const token = await verify('rece', target.verifierHash);
    const first = await request(app).post('/api/auth/recover/complete').send({
      recoveryToken: token,
      newLoginKey: freshLoginKey(),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: envelope(),
    });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/auth/recover/complete').send({
      recoveryToken: token,
      newLoginKey: freshLoginKey(),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: envelope(),
    });
    expect(second.status).toBe(401);
  });

  it('rejects an expired/unknown recovery token', async () => {
    const { body } = await register('recf');
    const target = (body.recoveryCodes as any[])[4];
    const token = await verify('recf', target.verifierHash);
    // Simulate expiry by dropping the Redis key before completing.
    await redisClient.del(`recover:${token}`);
    const res = await request(app).post('/api/auth/recover/complete').send({
      recoveryToken: token,
      newLoginKey: freshLoginKey(),
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: envelope(),
    });
    expect(res.status).toBe(401);
    // The code stays UNUSED because the swap never happened.
    const user = await prisma.user.findUnique({ where: { username: 'recf' } });
    const code = await prisma.recoveryCode.findFirst({
      where: { userId: user!.id, verifierHash: target.verifierHash },
    });
    expect(code!.usedAt).toBeNull();
  });
});

describe('POST /api/auth/password/change', () => {
  it('swaps credentials, keeps the current session, revokes other sessions', async () => {
    const { loginKey } = await register('pwc');
    // Session B (current, used to authenticate the change) + session C (other).
    const b = await login('pwc', loginKey);
    const c = await login('pwc', loginKey);

    const newKey = freshLoginKey();
    const res = await request(app)
      .post('/api/auth/password/change')
      .set('Authorization', `Bearer ${b.access}`)
      .send({
        currentLoginKey: loginKey,
        newLoginKey: newKey,
        newKekSalt: crypto.randomBytes(16).toString('base64'),
        newKekIterations: 600000,
        newMkPasswordWrapped: envelope(),
      });
    expect(res.status).toBe(200);

    // Current session (B) still refreshes; other session (C) revoked.
    const refreshB = await request(app).post('/api/auth/refresh').set('Cookie', b.cookie);
    expect(refreshB.status).toBe(200);
    const refreshC = await request(app).post('/api/auth/refresh').set('Cookie', c.cookie);
    expect(refreshC.status).toBe(401);

    // New loginKey logs in; the old one is rejected.
    const good = await request(app).post('/api/auth/login').send({ username: 'pwc', loginKey: newKey });
    expect(good.status).toBe(200);
    const old = await request(app).post('/api/auth/login').send({ username: 'pwc', loginKey });
    expect(old.status).toBe(401);
  });

  it('rejects a wrong current loginKey (401) and changes nothing', async () => {
    const { loginKey } = await register('pwc2');
    const b = await login('pwc2', loginKey);
    const res = await request(app)
      .post('/api/auth/password/change')
      .set('Authorization', `Bearer ${b.access}`)
      .send({
        currentLoginKey: freshLoginKey(),
        newLoginKey: freshLoginKey(),
        newKekSalt: crypto.randomBytes(16).toString('base64'),
        newKekIterations: 600000,
        newMkPasswordWrapped: envelope(),
      });
    expect(res.status).toBe(401);
    // Original loginKey still works.
    const still = await request(app).post('/api/auth/login').send({ username: 'pwc2', loginKey });
    expect(still.status).toBe(200);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/password/change').send({
      currentLoginKey: freshLoginKey(),
      newLoginKey: freshLoginKey(),
      newKekSalt: 'x',
      newKekIterations: 600000,
      newMkPasswordWrapped: envelope(),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/keys/master', () => {
  it('returns the current wrapped MK + KDF params for the authed user', async () => {
    const { body, loginKey } = await register('keym');
    const { access } = await login('keym', loginKey);
    const res = await request(app).get('/api/auth/keys/master').set('Authorization', `Bearer ${access}`);
    expect(res.status).toBe(200);
    expect(res.body.mkPasswordWrapped).toBe(body.mkPasswordWrapped);
    expect(res.body.kekSalt).toBe(body.kekSalt);
    expect(res.body.kekIterations).toBe(600000);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/auth/keys/master');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/recovery/reset (regenerate codes)', () => {
  const eightCodes = () =>
    Array.from({ length: 8 }, () => ({
      verifierHash: crypto.randomBytes(32).toString('hex'),
      wrappedMk: envelope(),
      wrapSalt: crypto.randomBytes(16).toString('base64'),
    }));

  it('replaces all recovery codes atomically (old dead, count stays 8)', async () => {
    const { body, loginKey } = await register('regen');
    const { access } = await login('regen', loginKey);
    const user = await prisma.user.findUnique({ where: { username: 'regen' } });
    const oldCode = (body.recoveryCodes as any[])[0];

    const res = await request(app)
      .post('/api/auth/recovery/reset')
      .set('Authorization', `Bearer ${access}`)
      .send({ loginKey, recoveryCodes: eightCodes() });
    expect(res.status).toBe(200);

    const count = await prisma.recoveryCode.count({ where: { userId: user!.id } });
    expect(count).toBe(8);

    // An old code is gone: verify with its (old) verifier fails.
    const verifyOld = await request(app)
      .post('/api/auth/recover/verify')
      .send({ username: 'regen', verifierHash: oldCode.verifierHash });
    expect(verifyOld.status).toBe(401);
  });

  it('rejects regeneration with a wrong password (401), leaving codes intact', async () => {
    const { body, loginKey } = await register('regen2');
    const { access } = await login('regen2', loginKey);
    const user = await prisma.user.findUnique({ where: { username: 'regen2' } });

    const res = await request(app)
      .post('/api/auth/recovery/reset')
      .set('Authorization', `Bearer ${access}`)
      .send({ loginKey: freshLoginKey(), recoveryCodes: eightCodes() });
    expect(res.status).toBe(401);

    // Original codes intact: an original verifier still verifies.
    const stillValid = await request(app)
      .post('/api/auth/recover/verify')
      .send({ username: 'regen2', verifierHash: (body.recoveryCodes as any[])[0].verifierHash });
    expect(stillValid.status).toBe(200);
    const count = await prisma.recoveryCode.count({ where: { userId: user!.id } });
    expect(count).toBe(8);
  });

  it('requires a valid TOTP code when 2FA is enabled', async () => {
    const { loginKey } = await register('regen3');
    const { access } = await login('regen3', loginKey);
    const user = await prisma.user.findUnique({ where: { username: 'regen3' } });
    await prisma.user.update({
      where: { id: user!.id },
      data: { totpEnabled: true, totpSecret: 'JBSWY3DPEHPK3PXP' },
    });

    const res = await request(app)
      .post('/api/auth/recovery/reset')
      .set('Authorization', `Bearer ${access}`)
      .send({ loginKey, recoveryCodes: eightCodes() }); // no totpCode
    expect(res.status).toBe(401);
  });

  it('rejects a payload that is not exactly 8 codes', async () => {
    const { loginKey } = await register('regen4');
    const { access } = await login('regen4', loginKey);
    const res = await request(app)
      .post('/api/auth/recovery/reset')
      .set('Authorization', `Bearer ${access}`)
      .send({ loginKey, recoveryCodes: eightCodes().slice(0, 5) });
    expect(res.status).toBe(400);
  });
});
