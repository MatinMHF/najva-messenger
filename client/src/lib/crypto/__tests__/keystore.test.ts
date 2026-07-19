import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  storeMasterKey,
  loadMasterKey,
  storeBlob,
  loadBlob,
  clearKeystore,
} from '../keystore';
import { randomBytes } from '../primitives';

const USER = 'user-1';

beforeEach(async () => {
  await clearKeystore();
});

describe('keystore', () => {
  it('stores and loads the master key for a user', async () => {
    const mk = randomBytes(32);
    await storeMasterKey(USER, mk);
    expect(await loadMasterKey(USER)).toEqual(mk);
  });

  it('returns null when no master key is stored', async () => {
    expect(await loadMasterKey('nobody')).toBeNull();
  });

  it('scopes keys per user', async () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    await storeMasterKey('user-a', a);
    await storeMasterKey('user-b', b);
    expect(await loadMasterKey('user-a')).toEqual(a);
    expect(await loadMasterKey('user-b')).toEqual(b);
  });

  it('stores and loads opaque blobs (ciphertext strings)', async () => {
    await storeBlob(USER, 'encryptedPrivateKeys', '{"v":1}');
    expect(await loadBlob(USER, 'encryptedPrivateKeys')).toBe('{"v":1}');
    expect(await loadBlob(USER, 'missing')).toBeNull();
  });

  it('clearKeystore wipes everything (logout)', async () => {
    await storeMasterKey(USER, randomBytes(32));
    await storeBlob(USER, 'x', 'y');
    await clearKeystore();
    expect(await loadMasterKey(USER)).toBeNull();
    expect(await loadBlob(USER, 'x')).toBeNull();
  });

  it('master key at rest is not stored as raw bytes', async () => {
    const mk = randomBytes(32);
    await storeMasterKey(USER, mk);
    // Inspect the raw IDB record: it must not contain the raw MK bytes.
    const raw = await new Promise<any>((resolve, reject) => {
      const open = indexedDB.open('najva-keystore');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('keys', 'readonly');
        const req = tx.objectStore('keys').get(`mk:${USER}`);
        req.onsuccess = () => { resolve(req.result); db.close(); };
        req.onerror = () => { reject(req.error); db.close(); };
      };
    });
    expect(raw).toBeDefined();
    const stored: Uint8Array | undefined = raw?.value?.ct;
    expect(stored).toBeDefined();
    expect(Array.from(stored!)).not.toEqual(Array.from(mk));
  });
});
