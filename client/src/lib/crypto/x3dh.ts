/**
 * X3DH (Extended Triple Diffie-Hellman) shared-secret agreement.
 */
import { Identity } from './keys';
import { DHKeyPair, dh, hkdf } from './primitives';

const INFO = new TextEncoder().encode('Najva-X3DH-v1');
const SALT = new Uint8Array(32); // zero salt per X3DH convention

const kdf = async (dhConcat: Uint8Array): Promise<Uint8Array> => {
  // Prepend 32 0xFF bytes (X3DH F) for domain separation
  const f = new Uint8Array(32).fill(0xff);
  const ikm = new Uint8Array(f.length + dhConcat.length);
  ikm.set(f, 0);
  ikm.set(dhConcat, f.length);
  return hkdf(ikm, SALT, INFO, 32);
};

const concat = (...arrs: Uint8Array[]): Uint8Array => {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
};

export interface InitiatorParams {
  identity: Identity;
  ephemeral: DHKeyPair;
  remoteIdentityDH: Uint8Array;
  remoteSignedPreKey: Uint8Array;
  remoteOneTimePreKey?: Uint8Array;
}

export const x3dhInitiator = async (p: InitiatorParams): Promise<Uint8Array> => {
  const dh1 = dh(p.identity.dh.secretKey, p.remoteSignedPreKey);
  const dh2 = dh(p.ephemeral.secretKey, p.remoteIdentityDH);
  const dh3 = dh(p.ephemeral.secretKey, p.remoteSignedPreKey);
  const parts = [dh1, dh2, dh3];
  if (p.remoteOneTimePreKey) parts.push(dh(p.ephemeral.secretKey, p.remoteOneTimePreKey));
  return kdf(concat(...parts));
};

export interface ResponderParams {
  identity: Identity;
  signedPreKey: DHKeyPair;
  oneTimePreKey?: DHKeyPair;
  remoteIdentityDH: Uint8Array;
  remoteEphemeral: Uint8Array;
}

export const x3dhResponder = async (p: ResponderParams): Promise<Uint8Array> => {
  const dh1 = dh(p.signedPreKey.secretKey, p.remoteIdentityDH);
  const dh2 = dh(p.identity.dh.secretKey, p.remoteEphemeral);
  const dh3 = dh(p.signedPreKey.secretKey, p.remoteEphemeral);
  const parts = [dh1, dh2, dh3];
  if (p.oneTimePreKey) parts.push(dh(p.oneTimePreKey.secretKey, p.remoteEphemeral));
  return kdf(concat(...parts));
};
