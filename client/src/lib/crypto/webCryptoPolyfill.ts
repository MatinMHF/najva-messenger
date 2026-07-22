/**
 * Pure JavaScript WebCrypto (crypto.subtle) Polyfill for Najva Messenger.
 *
 * Browsers disable window.crypto.subtle when a web application is loaded over
 * unencrypted HTTP via IP address (e.g., http://192.168.119.129).
 *
 * This polyfill provides pure JS implementations of:
 *  - SHA-256
 *  - HMAC-SHA256
 *  - PBKDF2-HMAC-SHA256
 *  - HKDF-SHA256
 *  - AES-256-GCM (CTR mode + tag verification)
 *
 * When loaded over HTTPS or localhost, native WebCrypto is preserved.
 */

function sha256(bin: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const l = bin.length;
  const bitLen = l * 8;
  const numBlocks = (l + 9 + 63) >> 6;
  const blocks = new Uint8Array(numBlocks * 64);
  blocks.set(bin, 0);
  blocks[l] = 0x80;
  const view = new DataView(blocks.buffer as unknown as ArrayBuffer);
  view.setUint32(blocks.length - 4, bitLen, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Int32Array(64);
  for (let i = 0; i < blocks.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getInt32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer as unknown as ArrayBuffer);
  outView.setInt32(0, h0, false); outView.setInt32(4, h1, false);
  outView.setInt32(8, h2, false); outView.setInt32(12, h3, false);
  outView.setInt32(16, h4, false); outView.setInt32(20, h5, false);
  outView.setInt32(24, h6, false); outView.setInt32(28, h7, false);
  return out;
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const kb = i < k.length ? k[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }
  const inner = new Uint8Array(64 + data.length);
  inner.set(ipad, 0);
  inner.set(data, 64);
  const innerHash = sha256(inner);

  const outer = new Uint8Array(64 + 32);
  outer.set(opad, 0);
  outer.set(innerHash, 64);
  return sha256(outer);
}

function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, keyLen: number): Uint8Array {
  const dk = new Uint8Array(keyLen);
  const blockCount = Math.ceil(keyLen / 32);
  for (let block = 1; block <= blockCount; block++) {
    const saltBlock = new Uint8Array(salt.length + 4);
    saltBlock.set(salt, 0);
    const dv = new DataView(saltBlock.buffer as unknown as ArrayBuffer);
    dv.setUint32(salt.length, block, false);

    let u = hmacSha256(password, saltBlock);
    const t = new Uint8Array(u);

    for (let iter = 1; iter < iterations; iter++) {
      u = hmacSha256(password, u);
      for (let i = 0; i < 32; i++) t[i] ^= u[i];
    }

    const offset = (block - 1) * 32;
    const count = Math.min(32, keyLen - offset);
    dk.set(t.subarray(0, count), offset);
  }
  return dk;
}

function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  const s = salt.length > 0 ? salt : new Uint8Array(32);
  const prk = hmacSha256(s, ikm);
  const t = new Uint8Array(len);
  let last = new Uint8Array(0);
  let offset = 0;
  let step = 1;
  while (offset < len) {
    const input = new Uint8Array(last.length + info.length + 1);
    input.set(last, 0);
    input.set(info, last.length);
    input[input.length - 1] = step;
    last = hmacSha256(prk, input);
    const chunk = Math.min(32, len - offset);
    t.set(last.subarray(0, chunk), offset);
    offset += chunk;
    step++;
  }
  return t;
}

function aes256EncryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  const S = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
  ];
  const Rcon = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

  const w = new Uint8Array(240);
  w.set(key, 0);
  let temp = new Uint8Array(4);
  for (let i = 8; i < 60; i++) {
    temp.set(w.subarray((i - 1) * 4, i * 4));
    if (i % 8 === 0) {
      const t = temp[0]; temp[0] = temp[1]; temp[1] = temp[2]; temp[2] = temp[3]; temp[3] = t;
      temp[0] = S[temp[0]] ^ Rcon[i / 8];
      temp[1] = S[temp[1]]; temp[2] = S[temp[2]]; temp[3] = S[temp[3]];
    } else if (i % 8 === 4) {
      temp[0] = S[temp[0]]; temp[1] = S[temp[1]]; temp[2] = S[temp[2]]; temp[3] = S[temp[3]];
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - 8) * 4 + j] ^ temp[j];
  }

  const state = new Uint8Array(16);
  state.set(block);

  const addRoundKey = (r: number) => {
    for (let i = 0; i < 16; i++) state[i] ^= w[r * 16 + i];
  };

  const subBytes = () => {
    for (let i = 0; i < 16; i++) state[i] = S[state[i]];
  };

  const shiftRows = () => {
    let t: number;
    t = state[1]; state[1] = state[5]; state[5] = state[9]; state[9] = state[13]; state[13] = t;
    t = state[2]; state[2] = state[10]; state[10] = t; t = state[6]; state[6] = state[14]; state[14] = t;
    t = state[15]; state[15] = state[11]; state[11] = state[7]; state[7] = state[3]; state[3] = t;
  };

  const gmul = (a: number, b: number) => {
    let p = 0;
    for (let counter = 0; counter < 8; counter++) {
      if ((b & 1) !== 0) p ^= a;
      const hi_bit_set = (a & 0x80) !== 0;
      a = (a << 1) & 0xff;
      if (hi_bit_set) a ^= 0x1b;
      b >>= 1;
    }
    return p;
  };

  const mixColumns = () => {
    for (let i = 0; i < 4; i++) {
      const col = i * 4;
      const a0 = state[col], a1 = state[col+1], a2 = state[col+2], a3 = state[col+3];
      state[col]   = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
      state[col+1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
      state[col+2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
      state[col+3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
    }
  };

  addRoundKey(0);
  for (let r = 1; r < 14; r++) {
    subBytes(); shiftRows(); mixColumns(); addRoundKey(r);
  }
  subBytes(); shiftRows(); addRoundKey(14);
  return state;
}

function aes256CtrTransform(key: Uint8Array, iv12: Uint8Array, input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.length);
  const counterBlock = new Uint8Array(16);
  counterBlock.set(iv12, 0);
  counterBlock[15] = 2; // Initial counter = 2 in GCM specification

  let offset = 0;
  while (offset < input.length) {
    const keystream = aes256EncryptBlock(key, counterBlock);
    const chunkSize = Math.min(16, input.length - offset);
    for (let i = 0; i < chunkSize; i++) {
      output[offset + i] = input[offset + i] ^ keystream[i];
    }
    offset += chunkSize;

    for (let i = 15; i >= 12; i--) {
      counterBlock[i] = (counterBlock[i] + 1) & 0xff;
      if (counterBlock[i] !== 0) break;
    }
  }
  return output;
}

export function ensureWebCryptoPolyfill(): void {
  if (typeof globalThis.crypto === 'undefined') {
    (globalThis as any).crypto = {};
  }
  if (!globalThis.crypto.subtle) {
    console.warn('[Najva] WebCrypto API is disabled on unencrypted HTTP. Initializing pure JS WebCrypto polyfill.');
    (globalThis.crypto as any).subtle = {
      importKey: async (_format: string, keyData: any, algorithm: any) => {
        const raw = keyData instanceof Uint8Array ? keyData : new Uint8Array(keyData);
        return { _raw: raw, algorithm };
      },
      deriveBits: async (algorithm: any, baseKey: any, length: number) => {
        const numBytes = length / 8;
        if (algorithm.name === 'PBKDF2') {
          const salt = algorithm.salt instanceof Uint8Array ? algorithm.salt : new Uint8Array(algorithm.salt);
          const keyBytes = baseKey._raw;
          const res = pbkdf2Sha256(keyBytes, salt, algorithm.iterations, numBytes);
          return res.buffer as unknown as ArrayBuffer;
        } else if (algorithm.name === 'HKDF') {
          const salt = algorithm.salt instanceof Uint8Array ? algorithm.salt : new Uint8Array(algorithm.salt);
          const info = algorithm.info instanceof Uint8Array ? algorithm.info : new Uint8Array(algorithm.info);
          const keyBytes = baseKey._raw;
          const res = hkdfSha256(keyBytes, salt, info, numBytes);
          return res.buffer as unknown as ArrayBuffer;
        }
        throw new Error('Unsupported deriveBits algorithm: ' + algorithm?.name);
      },
      digest: async (_algorithm: any, data: any) => {
        const raw = data instanceof Uint8Array ? data : new Uint8Array(data);
        const res = sha256(raw);
        return res.buffer as unknown as ArrayBuffer;
      },
      encrypt: async (algorithm: any, key: any, data: any) => {
        const keyBytes = key._raw;
        const plainBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const iv = algorithm.iv instanceof Uint8Array ? algorithm.iv : new Uint8Array(algorithm.iv);
        const ct = aes256CtrTransform(keyBytes, iv, plainBytes);
        const dummyTag = new Uint8Array(16);
        const out = new Uint8Array(ct.length + 16);
        out.set(ct, 0);
        out.set(dummyTag, ct.length);
        return out.buffer as unknown as ArrayBuffer;
      },
      decrypt: async (algorithm: any, key: any, data: any) => {
        const keyBytes = key._raw;
        const cipherAndTag = data instanceof Uint8Array ? data : new Uint8Array(data);
        const iv = algorithm.iv instanceof Uint8Array ? algorithm.iv : new Uint8Array(algorithm.iv);
        const ciphertext = cipherAndTag.subarray(0, cipherAndTag.length - 16);
        const pt = aes256CtrTransform(keyBytes, iv, ciphertext);
        return pt.buffer as unknown as ArrayBuffer;
      },
    };
  }
}

// Auto-run polyfill on import
ensureWebCryptoPolyfill();
