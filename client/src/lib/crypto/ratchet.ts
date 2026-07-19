/**
 * Double Ratchet Algorithm (tweetnacl + Web Crypto).
 *
 * Implements the symmetric (chain) ratchet, the DH ratchet, and skipped-key
 * handling for out-of-order delivery. Envelopes carry the sender's current
 * ratchet public key (`dhPub`), previous chain length (`pn`), message number
 * (`n`), iv, and ciphertext (raw Uint8Arrays — base64 serialization is
 * session.ts's job).
 */
import {
  DHKeyPair, dh, hkdf, generateDHKeyPair, aesGcmEncrypt, aesGcmDecrypt,
} from './primitives';

export interface ChainStep { nextChainKey: Uint8Array; messageKey: Uint8Array; }

const SALT = new Uint8Array(32);
const MAX_SKIP = 1000;

/** Symmetric-key ratchet: CK -> (CK', MK). */
export const kdfChainKey = async (chainKey: Uint8Array): Promise<ChainStep> => {
  const nextChainKey = await hkdf(chainKey, SALT, new TextEncoder().encode('Najva-CK'), 32);
  const messageKey = await hkdf(chainKey, SALT, new TextEncoder().encode('Najva-MK'), 32);
  return { nextChainKey, messageKey };
};

/** Root ratchet: (RK, dhOut) -> (RK', CK). */
export const kdfRootKey = async (
  rootKey: Uint8Array,
  dhOut: Uint8Array,
): Promise<{ rootKey: Uint8Array; chainKey: Uint8Array; }> => {
  const out = await hkdf(dhOut, rootKey, new TextEncoder().encode('Najva-RK'), 64);
  return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
};

export interface RatchetState {
  rootKey: Uint8Array;
  dhSelf: DHKeyPair | null;
  dhRemote: Uint8Array | null;
  sendChain: Uint8Array | null;
  recvChain: Uint8Array | null;
  sendN: number;
  recvN: number;
  prevN: number;
  skipped: Map<string, Uint8Array>;
}

export interface RatchetEnvelope {
  dhPub: Uint8Array;
  pn: number;
  n: number;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

/**
 * Initiator: knows the shared secret and the remote party's ratchet public
 * key (their signed pre-key). Seeds the first send chain via an immediate DH
 * ratchet step against the remote key.
 */
export const initRatchetInitiator = (
  sharedSecret: Uint8Array,
  remoteSignedPreKeyPub: Uint8Array,
): RatchetState => ({
  rootKey: sharedSecret,
  dhSelf: generateDHKeyPair(),
  dhRemote: remoteSignedPreKeyPub,
  sendChain: null,
  recvChain: null,
  sendN: 0,
  recvN: 0,
  prevN: 0,
  skipped: new Map(),
});

/**
 * Responder: knows the shared secret and owns the ratchet keypair (its signed
 * pre-key). The send/recv chains are derived lazily on first DH ratchet.
 */
export const initRatchetResponder = (
  sharedSecret: Uint8Array,
  ownSignedPreKey: DHKeyPair,
): RatchetState => ({
  rootKey: sharedSecret,
  dhSelf: ownSignedPreKey,
  dhRemote: null,
  sendChain: null,
  recvChain: null,
  sendN: 0,
  recvN: 0,
  prevN: 0,
  skipped: new Map(),
});

const b64Key = (dhPub: Uint8Array, n: number): string => {
  // compact, collision-free key for the skipped map
  let s = '';
  for (let i = 0; i < dhPub.length; i++) s += dhPub[i].toString(16).padStart(2, '0');
  return `${s}|${n}`;
};

/** Ensure the send chain exists (initiator's first message seeds it). */
const ensureSendChain = async (state: RatchetState): Promise<void> => {
  if (state.sendChain) return;
  if (!state.dhSelf || !state.dhRemote) throw new Error('Ratchet not initialized for sending');
  const dhOut = dh(state.dhSelf.secretKey, state.dhRemote);
  const { rootKey, chainKey } = await kdfRootKey(state.rootKey, dhOut);
  state.rootKey = rootKey;
  state.sendChain = chainKey;
};

export const ratchetEncrypt = async (
  state: RatchetState,
  plaintext: string,
): Promise<RatchetEnvelope> => {
  await ensureSendChain(state);
  const { nextChainKey, messageKey } = await kdfChainKey(state.sendChain!);
  state.sendChain = nextChainKey;
  const n = state.sendN;
  state.sendN += 1;
  const { ciphertext, iv } = await aesGcmEncrypt(messageKey, new TextEncoder().encode(plaintext));
  return {
    dhPub: state.dhSelf!.publicKey,
    pn: state.prevN,
    n,
    iv,
    ciphertext,
  };
};

const trySkipped = async (
  state: RatchetState,
  env: RatchetEnvelope,
): Promise<string | null> => {
  const key = b64Key(env.dhPub, env.n);
  const mk = state.skipped.get(key);
  if (!mk) return null;
  state.skipped.delete(key);
  const pt = await aesGcmDecrypt(mk, env.ciphertext, env.iv);
  return new TextDecoder().decode(pt);
};

/** Advance the recv chain, stashing skipped message keys up to `until`. */
const skipMessageKeys = async (state: RatchetState, until: number): Promise<void> => {
  if (!state.recvChain) return;
  if (state.recvN + MAX_SKIP < until) throw new Error('Too many skipped messages');
  while (state.recvN < until) {
    const { nextChainKey, messageKey } = await kdfChainKey(state.recvChain);
    state.recvChain = nextChainKey;
    state.skipped.set(b64Key(state.dhRemote!, state.recvN), messageKey);
    state.recvN += 1;
  }
};

/** Perform a DH ratchet step on receiving a new remote ratchet key. */
const dhRatchetStep = async (state: RatchetState, header: RatchetEnvelope): Promise<void> => {
  // First, skip remaining keys in the current receive chain up to header.pn.
  await skipMessageKeys(state, header.pn);

  state.prevN = state.sendN;
  state.sendN = 0;
  state.recvN = 0;
  state.dhRemote = header.dhPub;

  // Derive new receive chain from DH(self.secret, remote.pub).
  const dhRecv = dh(state.dhSelf!.secretKey, state.dhRemote);
  const recvDerived = await kdfRootKey(state.rootKey, dhRecv);
  state.rootKey = recvDerived.rootKey;
  state.recvChain = recvDerived.chainKey;

  // Rotate our own ratchet key and derive new send chain.
  state.dhSelf = generateDHKeyPair();
  const dhSend = dh(state.dhSelf.secretKey, state.dhRemote);
  const sendDerived = await kdfRootKey(state.rootKey, dhSend);
  state.rootKey = sendDerived.rootKey;
  state.sendChain = sendDerived.chainKey;
};

const sameKey = (a: Uint8Array | null, b: Uint8Array): boolean => {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

export const ratchetDecrypt = async (
  state: RatchetState,
  env: RatchetEnvelope,
): Promise<string> => {
  // 1. Try a previously-skipped message key.
  const skippedResult = await trySkipped(state, env);
  if (skippedResult !== null) return skippedResult;

  // 2. DH ratchet step if the remote ratchet key changed.
  if (!sameKey(state.dhRemote, env.dhPub)) {
    await dhRatchetStep(state, env);
  }

  // 3. Skip any messages preceding this one in the current chain.
  await skipMessageKeys(state, env.n);

  // 4. Derive this message's key.
  if (!state.recvChain) throw new Error('No receive chain established');
  const { nextChainKey, messageKey } = await kdfChainKey(state.recvChain);
  state.recvChain = nextChainKey;
  state.recvN += 1;

  const pt = await aesGcmDecrypt(messageKey, env.ciphertext, env.iv);
  return new TextDecoder().decode(pt);
};

export { dh };
export type { DHKeyPair };
