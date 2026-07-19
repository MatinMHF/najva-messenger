import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateCK,
  sealCKToMembers,
  getCK,
  primeCK,
  clearCKCache,
} from '../conversationKeys';
import { openEnvelope, sealEnvelope } from '../envelope';
import { generateDHKeyPair } from '../primitives';
import { arrayBufferToBase64 } from '../utils';
import { setActiveIdentity, clearActiveIdentity } from '../accountKeys';

vi.mock('../../api', () => ({ default: { get: vi.fn() } }));
import api from '../../api';
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

beforeEach(() => {
  clearCKCache();
  clearActiveIdentity();
  mockGet.mockReset();
});

describe('sealCKToMembers / openEnvelope round-trip', () => {
  it('seals a CK that each member can open with their identity secret', () => {
    const ck = generateCK();
    const alice = generateDHKeyPair();
    const bob = generateDHKeyPair();

    const wraps = sealCKToMembers(ck, [
      { userId: 'a', identityKeyPublic: arrayBufferToBase64(alice.publicKey) },
      { userId: 'b', identityKeyPublic: arrayBufferToBase64(bob.publicKey) },
    ]);

    expect(wraps).toHaveLength(2);
    expect(eq(openEnvelope(alice.secretKey, wraps[0].wrappedKey), ck)).toBe(true);
    expect(eq(openEnvelope(bob.secretKey, wraps[1].wrappedKey), ck)).toBe(true);
    // A stranger's secret cannot open it.
    const eve = generateDHKeyPair();
    expect(() => openEnvelope(eve.secretKey, wraps[0].wrappedKey)).toThrow();
  });
});

describe('getCK', () => {
  it('returns a primed CK from cache without hitting the server', async () => {
    const ck = generateCK();
    primeCK('conv1', 1, ck);
    const got = await getCK('conv1', 1);
    expect(eq(got, ck)).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches on miss and opens the wrap for the requested version', async () => {
    const me = generateDHKeyPair();
    setActiveIdentity(me.secretKey, me.secretKey);
    const ckV1 = generateCK();
    const ckV2 = generateCK();
    mockGet.mockResolvedValue({
      data: [
        { version: 1, wrappedKey: sealEnvelope(me.publicKey, ckV1) },
        { version: 2, wrappedKey: sealEnvelope(me.publicKey, ckV2) },
      ],
    });

    const got = await getCK('conv2', 2);
    expect(eq(got, ckV2)).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('/conversations/conv2/keys');

    // Both versions are now cached: a second call does not re-fetch.
    const gotV1 = await getCK('conv2', 1);
    expect(eq(gotV1, ckV1)).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('throws when the identity is locked and the CK is not cached', async () => {
    await expect(getCK('conv3', 1)).rejects.toThrow(/locked/);
  });

  it('throws when no wrap exists for the requested version', async () => {
    const me = generateDHKeyPair();
    setActiveIdentity(me.secretKey, me.secretKey);
    mockGet.mockResolvedValue({ data: [{ version: 1, wrappedKey: sealEnvelope(me.publicKey, generateCK()) }] });
    await expect(getCK('conv4', 5)).rejects.toThrow(/no CK/);
  });
});
