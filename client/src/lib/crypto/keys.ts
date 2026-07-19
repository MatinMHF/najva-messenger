/**
 * Key generation for the Signal Protocol implementation (tweetnacl-backed).
 */
import { DHKeyPair, SigningKeyPair, generateDHKeyPair, generateSigningKeyPair, sign } from './primitives';

export interface Identity {
  dh: DHKeyPair;        // X25519 — used for X3DH/DH
  signing: SigningKeyPair; // Ed25519 — used to sign the signed pre-key
}

export interface SignedPreKey {
  id: number;
  keyPair: DHKeyPair;   // X25519
  signature: Uint8Array; // Ed25519 signature of keyPair.publicKey
}

export interface OneTimePreKey {
  id: number;
  keyPair: DHKeyPair;   // X25519
}

export const generateIdentity = async (): Promise<Identity> => ({
  dh: generateDHKeyPair(),
  signing: generateSigningKeyPair(),
});

export const generateSignedPreKey = async (identity: Identity, id: number): Promise<SignedPreKey> => {
  const keyPair = generateDHKeyPair();
  const signature = sign(keyPair.publicKey, identity.signing.secretKey);
  return { id, keyPair, signature };
};

export const generatePreKeys = async (count: number, startId: number): Promise<OneTimePreKey[]> => {
  const keys: OneTimePreKey[] = [];
  for (let i = 0; i < count; i++) {
    keys.push({ id: startId + i, keyPair: generateDHKeyPair() });
  }
  return keys;
};

/**
 * Backward-compatible shim used by RegisterForm.tsx (publishes a public key
 * at registration time). Returns a fresh X25519 DH keypair in the legacy
 * `{ publicKey, privateKey }` shape.
 */
export interface KeyPair { publicKey: Uint8Array; privateKey: Uint8Array; }

export const generateIdentityKeyPair = async (): Promise<KeyPair> => {
  const kp = generateDHKeyPair();
  return { publicKey: kp.publicKey, privateKey: kp.secretKey };
};
