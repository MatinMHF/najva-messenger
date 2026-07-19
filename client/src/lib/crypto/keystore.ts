/**
 * IndexedDB keystore (docs/ENCRYPTION.md, "Client key handling").
 *
 * Stores a non-extractable device-local AES-GCM CryptoKey and the user's
 * Master Key encrypted under it. Raw MK bytes are recoverable on demand —
 * required by recovery flow C, where this device seals raw MK to a
 * recovering device — but never persisted unencrypted, so IndexedDB theft
 * without code execution in the origin reveals nothing.
 */

const DB_NAME = 'najva-keystore';
const STORE = 'keys';
const DEVICE_KEY_ID = 'device-key';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idbGet = async (key: string): Promise<any> => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
};

const idbPut = async (key: string, value: any): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

/** Non-extractable device key; created on first use. */
const getDeviceKey = async (): Promise<CryptoKey> => {
  const existing = await idbGet(DEVICE_KEY_ID);
  if (existing) return existing as CryptoKey;
  const key = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: IndexedDB theft alone cannot recover it
    ['encrypt', 'decrypt'],
  );
  await idbPut(DEVICE_KEY_ID, key);
  return key;
};

export const storeMasterKey = async (userId: string, mk: Uint8Array): Promise<void> => {
  const deviceKey = await getDeviceKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      deviceKey,
      mk as unknown as BufferSource,
    ),
  );
  await idbPut(`mk:${userId}`, { value: { iv, ct } });
};

export const loadMasterKey = async (userId: string): Promise<Uint8Array | null> => {
  const record = await idbGet(`mk:${userId}`);
  if (!record?.value) return null;
  const deviceKey = await getDeviceKey();
  try {
    const pt = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.value.iv as unknown as BufferSource },
      deviceKey,
      record.value.ct as unknown as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    return null; // device key rotated/lost — caller falls back to login unwrap
  }
};

/** Opaque ciphertext blobs (e.g. server-issued encryptedPrivateKeys). */
export const storeBlob = (userId: string, name: string, value: string): Promise<void> =>
  idbPut(`blob:${userId}:${name}`, value);

export const loadBlob = async (userId: string, name: string): Promise<string | null> => {
  const v = await idbGet(`blob:${userId}:${name}`);
  return typeof v === 'string' ? v : null;
};

/** Wipe everything — call on logout. */
export const clearKeystore = async (): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
