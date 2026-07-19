/**
 * Deterministic 6-word fingerprint of an X25519 public key (docs/ENCRYPTION.md
 * flow C). Device B (which generated the key) and device A (which received it
 * over the relay) each compute this independently and the user compares them by
 * eye — a mismatch means the server swapped the key (MITM). The words are latin
 * and shown LTR in every locale, since they are compared visually, not read.
 *
 * The 256-word list is built by construction (16 onsets × 16 rhymes) so it is
 * guaranteed to be exactly 256 unique, pronounceable tokens with no typos.
 */
import { base64ToArrayBuffer } from './utils';

const ONSETS = ['b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z'];
const RHYMES = ['al', 'an', 'ar', 'at', 'el', 'en', 'er', 'et', 'il', 'in', 'ir', 'it', 'ol', 'on', 'or', 'ot'];

export const FINGERPRINT_WORDLIST: string[] = ONSETS.flatMap((o) => RHYMES.map((r) => o + r));

/**
 * Compute the fingerprint words for a base64-encoded public key. Deterministic:
 * the same key always yields the same words on any device.
 */
export const fingerprintWords = async (ephemeralPubB64: string, count = 6): Promise<string[]> => {
  const bytes = new Uint8Array(base64ToArrayBuffer(ephemeralPubB64));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
  return Array.from({ length: count }, (_, i) => FINGERPRINT_WORDLIST[digest[i]]);
};
