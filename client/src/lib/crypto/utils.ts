/**
 * Utility functions for cryptographic operations.
 * Environment-agnostic (browser + Node/Vitest): randomness via tweetnacl,
 * base64 via globalThis btoa/atob with a Buffer fallback.
 */
import nacl from 'tweetnacl';

export const generateRandomBytes = (length: number): Uint8Array => nacl.randomBytes(length);

const encodeBase64 = (binary: string): string => {
  if (typeof btoa === 'function') return btoa(binary);
  // Node fallback
  const B = (globalThis as any).Buffer;
  return B.from(binary, 'binary').toString('base64');
};

const decodeBase64 = (base64: string): string => {
  if (typeof atob === 'function') return atob(base64);
  // Node fallback
  const B = (globalThis as any).Buffer;
  return B.from(base64, 'base64').toString('binary');
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  let binary = '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return encodeBase64(binary);
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary_string = decodeBase64(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};
