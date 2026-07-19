import crypto from 'crypto';
import type { Response } from 'supertest';
import { prisma } from '../utils/prisma';

/** Wipe all rows the auth flow touches. CASCADE handles dependent tables. */
export const resetDb = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Conversation" RESTART IDENTITY CASCADE',
  );
};

const envelope = () => JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'AAAAAAAAAAAAAAAA', ct: 'BBBBBBBB' });
const sealed = () => JSON.stringify({ v: 1, alg: 'sealbox', ct: 'CCCCCCCC' });

export interface RegisterFixture {
  body: Record<string, unknown>;
  loginKey: string;
}

/**
 * A valid-shaped register payload. The server stores wrapped blobs opaquely,
 * so realistic-but-fake ciphertext is enough to exercise the endpoints; only
 * loginKey / kekSalt need to round-trip.
 */
export const registerFixture = (username: string): RegisterFixture => {
  const loginKey = crypto.randomBytes(32).toString('hex');
  return {
    loginKey,
    body: {
      username,
      displayName: username,
      loginKey,
      kekSalt: crypto.randomBytes(16).toString('base64'),
      kekIterations: 600000,
      mkPasswordWrapped: envelope(),
      encryptedPrivateKeys: envelope(),
      identityKeyPublic: crypto.randomBytes(32).toString('base64'),
      identitySigningPublic: crypto.randomBytes(32).toString('base64'),
      recoveryCodes: Array.from({ length: 8 }, () => ({
        verifierHash: crypto.randomBytes(32).toString('hex'),
        wrappedMk: envelope(),
        wrapSalt: crypto.randomBytes(16).toString('base64'),
      })),
      savedMessagesKey: { wrappedKey: sealed() },
    },
  };
};

/** Extract the `refreshToken=...` cookie pair from a Set-Cookie response. */
export const refreshCookie = (res: Response): string | null => {
  const raw = (res.headers['set-cookie'] as unknown as string[]) || [];
  const found = raw.find((c) => c.startsWith('refreshToken='));
  return found ? found.split(';')[0] : null;
};
