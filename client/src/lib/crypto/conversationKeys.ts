/**
 * Conversation-Key (CK) distribution client (docs/ENCRYPTION.md, "Key hierarchy"
 * → CK, and "Membership changes"). The server stores only sealed-box wraps of a
 * CK, one per member; this module generates CKs, seals them to members' identity
 * public keys, and — on the read side — fetches the caller's wraps and opens them
 * with the in-memory identity secret, caching the raw CK bytes per (conv,version).
 *
 * The CK itself is never sent to the server in the clear: `sealCKToMembers`
 * produces opaque `sealbox` envelopes and `getCK` only ever holds raw bytes in
 * memory.
 */
import api from '../api';
import { sealEnvelope, openEnvelope } from './envelope';
import { getActiveIdentity } from './accountKeys';
import { randomBytes } from './primitives';
import { base64ToArrayBuffer } from './utils';

export interface MemberKey {
  userId: string;
  identityKeyPublic: string; // b64 X25519 public
}

export interface CkWrap {
  userId: string;
  wrappedKey: string; // sealbox envelope
}

interface CkRow {
  version: number;
  wrappedKey: string;
}

const b64ToBytes = (b64: string): Uint8Array => new Uint8Array(base64ToArrayBuffer(b64));

// convId -> (version -> raw CK bytes). In-memory only; cleared on logout.
const ckCache = new Map<string, Map<number, Uint8Array>>();

const cacheGet = (convId: string, version: number): Uint8Array | undefined =>
  ckCache.get(convId)?.get(version);

const cachePut = (convId: string, version: number, ck: Uint8Array): void => {
  let byVersion = ckCache.get(convId);
  if (!byVersion) {
    byVersion = new Map();
    ckCache.set(convId, byVersion);
  }
  byVersion.set(version, ck);
};

/** A fresh 32-byte conversation key. */
export const generateCK = (): Uint8Array => randomBytes(32);

/** Seal a CK to each member's X25519 identity public key (one wrap per member). */
export const sealCKToMembers = (ck: Uint8Array, members: MemberKey[]): CkWrap[] =>
  members.map((m) => ({ userId: m.userId, wrappedKey: sealEnvelope(b64ToBytes(m.identityKeyPublic), ck) }));

/** Fetch a member's identity public key so a CK can be sealed to them. */
export const fetchMemberKey = async (userId: string): Promise<MemberKey> => {
  const res = await api.get(`/keys/${userId}/bundle`);
  return { userId, identityKeyPublic: res.data.identityKeyPublic };
};

/**
 * Seed the cache with a CK we just generated (e.g. right after creating a
 * conversation), so we don't round-trip to the server to open our own wrap.
 */
export const primeCK = (convId: string, version: number, ck: Uint8Array): void =>
  cachePut(convId, version, ck);

/**
 * Get the raw CK for (conversationId, version). Cache-first; on a miss, fetch all
 * of the caller's wraps for the conversation and open them with the in-memory
 * identity secret (caching every version we can open, not just the requested
 * one). Throws if the identity is locked or no wrap for the version exists.
 */
export const getCK = async (conversationId: string, version: number): Promise<Uint8Array> => {
  const hit = cacheGet(conversationId, version);
  if (hit) return hit;

  const identity = getActiveIdentity();
  if (!identity) throw new Error('conversationKeys: identity is locked');

  const res = await api.get(`/conversations/${conversationId}/keys`);
  const rows = (res.data ?? []) as CkRow[];
  for (const row of rows) {
    if (cacheGet(conversationId, row.version)) continue;
    try {
      cachePut(conversationId, row.version, openEnvelope(identity.secret, row.wrappedKey));
    } catch {
      // A wrap we can't open (wrong version sealed to someone else, corruption)
      // is skipped rather than fatal — other versions may still open.
    }
  }

  const target = cacheGet(conversationId, version);
  if (!target) throw new Error(`conversationKeys: no CK for ${conversationId} v${version}`);
  return target;
};

/** Drop all cached CKs (call on logout). */
export const clearCKCache = (): void => ckCache.clear();
