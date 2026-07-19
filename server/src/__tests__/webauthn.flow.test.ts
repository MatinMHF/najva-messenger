import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

// The WebAuthn ceremony verifiers depend on a real authenticator; mock them so
// the tests exercise OUR logic (credential storage, counter-regression,
// session issuance, single-use challenges, PRF-only recovery) with controlled
// verification results rather than fabricated attestation blobs.
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(async () => ({
    challenge: 'reg-challenge',
    rp: { id: 'localhost', name: 'Najva' },
    user: { id: 'x', name: 'x', displayName: 'x' },
    pubKeyCredParams: [],
    excludeCredentials: [],
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: { id: 'cred-A', publicKey: new Uint8Array([1, 2, 3, 4]), counter: 0, transports: ['internal'] },
      credentialDeviceType: 'multiDevice',
      credentialBackedUp: true,
    },
  })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: 'auth-challenge', allowCredentials: [] })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { credentialID: 'cred-A', newCounter: 1 },
  })),
}));

import * as swa from '@simplewebauthn/server';
import { createApp } from '../app';
import { prisma } from '../utils/prisma';
import { redisClient } from '../utils/redis';
import { resetDb, registerFixture, refreshCookie } from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  // Restore default mock implementations after clearAllMocks wiped them.
  vi.mocked(swa.generateRegistrationOptions).mockResolvedValue({ challenge: 'reg-challenge' } as any);
  vi.mocked(swa.verifyRegistrationResponse).mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: { id: 'cred-A', publicKey: new Uint8Array([1, 2, 3, 4]), counter: 0, transports: ['internal'] },
      credentialDeviceType: 'multiDevice',
      credentialBackedUp: true,
    },
  } as any);
  vi.mocked(swa.generateAuthenticationOptions).mockResolvedValue({ challenge: 'auth-challenge' } as any);
  vi.mocked(swa.verifyAuthenticationResponse).mockResolvedValue({
    verified: true,
    authenticationInfo: { credentialID: 'cred-A', newCounter: 1 },
  } as any);
});

afterAll(async () => {
  await prisma.$disconnect();
  await redisClient.quit();
});

const envelope = () => JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'AAAAAAAAAAAAAAAA', ct: 'EEEEEEEE' });

const register = async (username: string) => {
  const fixture = registerFixture(username);
  const res = await request(app).post('/api/auth/register').send(fixture.body);
  return { ...fixture, access: res.body.tokens.accessToken as string };
};

/** Run the registration ceremony (options + verify) and return the credential id. */
const registerPasskey = async (access: string, body: Record<string, unknown> = {}) => {
  const opt = await request(app)
    .post('/api/auth/webauthn/register/options')
    .set('Authorization', `Bearer ${access}`)
    .send({});
  expect(opt.status).toBe(200);
  const verify = await request(app)
    .post('/api/auth/webauthn/register/verify')
    .set('Authorization', `Bearer ${access}`)
    .send({ response: { id: 'cred-A', rawId: 'cred-A', response: {}, type: 'public-key' }, ...body });
  return { opt, verify };
};

describe('POST /api/auth/webauthn/register (authed)', () => {
  it('stores a credential (non-PRF by default) with counter and transports', async () => {
    const { access } = await register('wa-reg');
    const { opt, verify } = await registerPasskey(access);
    expect(typeof opt.body.prfSalt).toBe('string');
    expect(verify.status).toBe(201);
    expect(verify.body.credentialId).toBe('cred-A');
    expect(verify.body.prfSupported).toBe(false);

    const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: 'cred-A' } });
    expect(cred).not.toBeNull();
    expect(cred!.counter).toBe(0n);
    expect(cred!.prfSupported).toBe(false);
    expect(cred!.wrappedMk).toBeNull();
    expect(cred!.prfSalt).not.toBeNull();
    expect(cred!.transports).toContain('internal');
  });

  it('stores a PRF credential with wrappedMk when the client harvests PRF at create', async () => {
    const { access } = await register('wa-reg-prf');
    const { verify } = await registerPasskey(access, { wrappedMk: envelope() });
    expect(verify.body.prfSupported).toBe(true);
    const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: 'cred-A' } });
    expect(cred!.prfSupported).toBe(true);
    expect(cred!.wrappedMk).toBe(envelope());
  });

  it('rejects registration verify without authentication', async () => {
    const res = await request(app)
      .post('/api/auth/webauthn/register/verify')
      .send({ response: {} });
    expect(res.status).toBe(401);
  });

  it('rejects a reused registration challenge (single-use)', async () => {
    const { access } = await register('wa-reg-single');
    await registerPasskey(access);
    // The challenge was consumed; a second verify with no fresh options fails.
    const second = await request(app)
      .post('/api/auth/webauthn/register/verify')
      .set('Authorization', `Bearer ${access}`)
      .send({ response: { id: 'cred-A', rawId: 'cred-A', response: {}, type: 'public-key' } });
    expect(second.status).toBe(400);
  });

  it('deferred PRF harvest sets wrappedMk + prfSupported on the credential', async () => {
    const { access } = await register('wa-reg-defer');
    await registerPasskey(access);
    const patch = await request(app)
      .post('/api/auth/webauthn/register/prf')
      .set('Authorization', `Bearer ${access}`)
      .send({ credentialId: 'cred-A', wrappedMk: envelope() });
    expect(patch.status).toBe(200);
    const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: 'cred-A' } });
    expect(cred!.prfSupported).toBe(true);
    expect(cred!.wrappedMk).toBe(envelope());
  });
});

describe('POST /api/auth/webauthn/login (discoverable, unauthed)', () => {
  const doLogin = async () => {
    const opt = await request(app).post('/api/auth/webauthn/login/options').send({});
    const challengeId = opt.body.challengeId as string;
    const verify = await request(app)
      .post('/api/auth/webauthn/login/verify')
      .send({ challengeId, response: { id: 'cred-A', rawId: 'cred-A', response: {}, type: 'public-key' } });
    return { opt, verify };
  };

  it('issues a session (tokens + refresh cookie) and updates counter/lastUsedAt', async () => {
    const { access } = await register('wa-login');
    await registerPasskey(access);

    const { opt, verify } = await doLogin();
    expect(typeof opt.body.challengeId).toBe('string');
    expect(verify.status).toBe(200);
    expect(verify.body.tokens.accessToken).toBeTruthy();
    expect(refreshCookie(verify)).not.toBeNull();
    expect(verify.body.user.username).toBe('wa-login');

    const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: 'cred-A' } });
    expect(cred!.counter).toBe(1n);
    expect(cred!.lastUsedAt).not.toBeNull();
  });

  it('rejects a cloned authenticator (counter regression)', async () => {
    const { access } = await register('wa-clone');
    await registerPasskey(access);
    // Advance the stored counter beyond what the next assertion will report.
    await prisma.webAuthnCredential.update({ where: { credentialId: 'cred-A' }, data: { counter: 10n } });
    vi.mocked(swa.verifyAuthenticationResponse).mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { credentialID: 'cred-A', newCounter: 5 },
    } as any);
    const { verify } = await doLogin();
    expect(verify.status).toBe(401);
  });

  it('rejects a reused login challenge (single-use)', async () => {
    const { access } = await register('wa-login-single');
    await registerPasskey(access);
    const opt = await request(app).post('/api/auth/webauthn/login/options').send({});
    const challengeId = opt.body.challengeId as string;
    const first = await request(app)
      .post('/api/auth/webauthn/login/verify')
      .send({ challengeId, response: { id: 'cred-A', rawId: 'cred-A', response: {}, type: 'public-key' } });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post('/api/auth/webauthn/login/verify')
      .send({ challengeId, response: { id: 'cred-A', rawId: 'cred-A', response: {}, type: 'public-key' } });
    expect(second.status).toBe(400);
  });
});

describe('POST /api/auth/webauthn/recover (flow B — PRF only)', () => {
  const doRecover = async () => {
    const opt = await request(app).post('/api/auth/webauthn/recover/options').send({});
    const challengeId = opt.body.challengeId as string;
    const verify = await request(app)
      .post('/api/auth/webauthn/recover/verify')
      .send({ challengeId, response: { id: 'cred-A', rawId: 'cred-A', response: {}, type: 'public-key' } });
    return verify;
  };

  it('returns wrappedMk + prfSalt + recoveryToken for a PRF credential', async () => {
    const { access } = await register('wa-rec');
    await registerPasskey(access);
    await request(app)
      .post('/api/auth/webauthn/register/prf')
      .set('Authorization', `Bearer ${access}`)
      .send({ credentialId: 'cred-A', wrappedMk: envelope() });

    const verify = await doRecover();
    expect(verify.status).toBe(200);
    expect(verify.body.wrappedMk).toBe(envelope());
    expect(typeof verify.body.prfSalt).toBe('string');
    expect(typeof verify.body.recoveryToken).toBe('string');
    expect(verify.body.encryptedPrivateKeys).toBeTruthy();
  });

  it('refuses recovery for a non-PRF credential (cannot recover history)', async () => {
    const { access } = await register('wa-rec-noprf');
    await registerPasskey(access); // no PRF harvest → prfSupported false
    const verify = await doRecover();
    expect(verify.status).toBe(400);
    expect(verify.body.recoveryToken).toBeUndefined();
  });

  it('the recoveryToken completes recovery via the shared /auth/recover/complete', async () => {
    const { access } = await register('wa-rec-complete');
    await registerPasskey(access);
    await request(app)
      .post('/api/auth/webauthn/register/prf')
      .set('Authorization', `Bearer ${access}`)
      .send({ credentialId: 'cred-A', wrappedMk: envelope() });
    const user = await prisma.user.findUnique({ where: { username: 'wa-rec-complete' } });
    await prisma.user.update({ where: { id: user!.id }, data: { totpEnabled: true, totpSecret: 'JBSWY3DPEHPK3PXP' } });

    const verify = await doRecover();
    const token = verify.body.recoveryToken as string;
    const newKey = crypto.randomBytes(32).toString('hex');
    const complete = await request(app).post('/api/auth/recover/complete').send({
      recoveryToken: token,
      newLoginKey: newKey,
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: envelope(),
    });
    expect(complete.status).toBe(200);
    // TOTP disabled + new password works — same semantics as flow A.
    const after = await prisma.user.findUnique({ where: { id: user!.id } });
    expect(after!.totpEnabled).toBe(false);
    const login = await request(app).post('/api/auth/login').send({ username: 'wa-rec-complete', loginKey: newKey });
    expect(login.status).toBe(200);
  });
});

describe('GET/DELETE /api/auth/webauthn/credentials (authed)', () => {
  it('lists credentials and deletes with password confirmation', async () => {
    const { access, loginKey } = await register('wa-list');
    await registerPasskey(access);

    const list = await request(app)
      .get('/api/auth/webauthn/credentials')
      .set('Authorization', `Bearer ${access}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.credentials)).toBe(true);
    expect(list.body.credentials).toHaveLength(1);
    const id = list.body.credentials[0].id as string;

    // Wrong password → rejected.
    const bad = await request(app)
      .delete(`/api/auth/webauthn/credentials/${id}`)
      .set('Authorization', `Bearer ${access}`)
      .send({ loginKey: crypto.randomBytes(32).toString('hex') });
    expect(bad.status).toBe(401);

    // Correct password → deleted.
    const ok = await request(app)
      .delete(`/api/auth/webauthn/credentials/${id}`)
      .set('Authorization', `Bearer ${access}`)
      .send({ loginKey });
    expect(ok.status).toBe(200);
    const count = await prisma.webAuthnCredential.count();
    expect(count).toBe(0);
  });
});
