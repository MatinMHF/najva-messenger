/**
 * Client attachment pipeline. Encrypts bytes (and, for images, a generated
 * thumbnail) under a per-file FK wrapped by the conversation key, uploads the
 * opaque blobs, and — on the read side — downloads + decrypts to an object URL.
 * Plaintext bytes never leave the browser.
 */
import api from './api';
import { encryptAttachment, decryptAttachment } from './crypto/fileCrypto';

export interface UploadedAttachment {
  id: string;
  url: string;
  thumbnailUrl?: string;
}

export interface AttachmentMeta {
  width?: number;
  height?: number;
  duration?: number;
  /** Real content type of the plaintext, persisted server-side for render hints. */
  mimeType?: string;
}

/**
 * Encrypt `file` (+ optional pre-rendered thumbnail bytes) under the
 * conversation's current CK and upload. Returns the created attachment id.
 */
export const uploadEncryptedAttachment = async (
  conversationId: string,
  version: number,
  file: Blob,
  fileName: string,
  opts: AttachmentMeta & { thumbnail?: Uint8Array } = {},
): Promise<UploadedAttachment> => {
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const { blob, thumbnailBlob, encryptedKey } = await encryptAttachment(
    conversationId, version, fileBytes, opts.thumbnail,
  );

  const form = new FormData();
  // Upload OPAQUE names so the server never stores the real filename in plaintext
  // (the real name travels E2EE in the message caption). `fileName` is unused for
  // the transport name on purpose.
  void fileName;
  form.append('file', new Blob([blob as unknown as BlobPart]), 'attachment.enc');
  if (thumbnailBlob) form.append('thumbnail', new Blob([thumbnailBlob as unknown as BlobPart]), 'attachment.thumb.enc');
  form.append('encryptedKey', encryptedKey);
  // Declare the REAL content type so the server can persist it as a display
  // hint — the uploaded blob itself is opaque ciphertext (octet-stream).
  if (opts.mimeType || file.type) form.append('mimeType', opts.mimeType || file.type);
  if (opts.width) form.append('width', String(opts.width));
  if (opts.height) form.append('height', String(opts.height));
  if (opts.duration) form.append('duration', String(opts.duration));

  const res = await api.post('/files/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

/** Download an encrypted attachment (or its thumbnail) and decrypt to an object URL. */
export const fetchDecryptedObjectUrl = async (
  conversationId: string,
  version: number,
  attachmentId: string,
  encryptedKey: string,
  mimeType: string,
  thumbnail = false,
): Promise<string> => {
  const path = thumbnail ? `/files/${attachmentId}/thumbnail` : `/files/${attachmentId}`;
  const res = await api.get(path, { responseType: 'arraybuffer' });
  const blob = new Uint8Array(res.data as ArrayBuffer);
  const plain = await decryptAttachment(conversationId, version, encryptedKey, blob);
  return URL.createObjectURL(new Blob([plain as unknown as BlobPart], { type: mimeType }));
};

/**
 * Best-effort image thumbnail (max 256px, JPEG) as raw bytes for encryption.
 * Returns undefined if the browser can't decode the image (non-fatal).
 */
export const generateImageThumbnail = async (file: Blob): Promise<Uint8Array | undefined> => {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const thumbBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7),
    );
    if (!thumbBlob) return undefined;
    return new Uint8Array(await thumbBlob.arrayBuffer());
  } catch {
    return undefined;
  }
};

/** Map a File's MIME type to the server MessageType enum. */
export const messageTypeForFile = (mime: string): 'IMAGE' | 'VIDEO' | 'VOICE' | 'FILE' => {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'VOICE';
  return 'FILE';
};
