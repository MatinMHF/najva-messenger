/**
 * Session orchestrator + on-wire envelope.
 *
 * Composes X3DH (session establishment) with the Double Ratchet (per-message
 * encryption) and (de)serializes the exact fields the server stores:
 *   encryptedContent, iv, ephemeralKey, senderKeyVersion.
 *
 * The first message from the initiator carries Alice's identity DH pub +
 * ephemeral pub + prekey ids (packed into `ephemeralKey` as base64 JSON)
 * so the responder can run X3DH on receipt.
 */
import { Identity, SignedPreKey, OneTimePreKey } from './keys';
import { generateDHKeyPair } from './primitives';
import { x3dhInitiator, x3dhResponder } from './x3dh';
import {
  initRatchetInitiator, initRatchetResponder, ratchetEncrypt, ratchetDecrypt, RatchetState,
} from './ratchet';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

const b64 = (u: Uint8Array): string => arrayBufferToBase64(u);
const unb64 = (s: string): Uint8Array => new Uint8Array(base64ToArrayBuffer(s));

export interface RemoteBundle {
  identityDH: Uint8Array;
  signedPreKey: Uint8Array;
  signedPreKeyId: number;
  oneTimePreKey?: Uint8Array;
  oneTimePreKeyId?: number;
}

export interface InitialHeader {
  identityDH: string;
  ephemeral: string;
  signedPreKeyId: number;
  oneTimePreKeyId?: number;
}

export interface Session { state: RatchetState; initialHeader?: InitialHeader; }

/** On-wire shape matching Prisma Message columns. */
export interface WireMessage {
  encryptedContent: string; // base64 ciphertext
  iv: string;               // base64 iv
  ephemeralKey: string;     // base64(JSON header): X3DH init info + ratchet header
  senderKeyVersion: number;
}

export const establishSessionAsInitiator = async (
  identity: Identity,
  bundle: RemoteBundle,
): Promise<Session> => {
  const ephemeral = generateDHKeyPair();
  const sharedSecret = await x3dhInitiator({
    identity, ephemeral,
    remoteIdentityDH: bundle.identityDH,
    remoteSignedPreKey: bundle.signedPreKey,
    remoteOneTimePreKey: bundle.oneTimePreKey,
  });
  const state = initRatchetInitiator(sharedSecret, bundle.signedPreKey);
  // header bob needs for X3DH on first message
  const initialHeader: InitialHeader = {
    identityDH: b64(identity.dh.publicKey),
    ephemeral: b64(ephemeral.publicKey),
    signedPreKeyId: bundle.signedPreKeyId,
    oneTimePreKeyId: bundle.oneTimePreKeyId,
  };
  return { state, initialHeader };
};

export const establishSessionAsResponder = async (
  identity: Identity,
  signedPreKey: SignedPreKey,
  oneTimePreKey: OneTimePreKey | undefined,
  firstWire: WireMessage,
): Promise<Session> => {
  const header = JSON.parse(new TextDecoder().decode(unb64(firstWire.ephemeralKey)));
  const sharedSecret = await x3dhResponder({
    identity,
    signedPreKey: signedPreKey.keyPair,
    oneTimePreKey: oneTimePreKey?.keyPair,
    remoteIdentityDH: unb64(header.identityDH),
    remoteEphemeral: unb64(header.ephemeral),
  });
  const state = initRatchetResponder(sharedSecret, signedPreKey.keyPair);
  return { state };
};

export const encrypt = async (session: Session, plaintext: string): Promise<WireMessage> => {
  const env = await ratchetEncrypt(session.state, plaintext); // { dhPub, pn, n, iv, ciphertext }
  const header = {
    ...(session.initialHeader || {}),
    ratchet: { dhPub: b64(env.dhPub), pn: env.pn, n: env.n },
  };
  return {
    encryptedContent: b64(env.ciphertext),
    iv: b64(env.iv),
    ephemeralKey: arrayBufferToBase64(new TextEncoder().encode(JSON.stringify(header))),
    senderKeyVersion: 1,
  };
};

export const decrypt = async (session: Session, wire: WireMessage): Promise<string> => {
  const header = JSON.parse(new TextDecoder().decode(unb64(wire.ephemeralKey)));
  const env = {
    dhPub: unb64(header.ratchet.dhPub),
    pn: header.ratchet.pn,
    n: header.ratchet.n,
    iv: unb64(wire.iv),
    ciphertext: unb64(wire.encryptedContent),
  };
  return ratchetDecrypt(session.state, env);
};
