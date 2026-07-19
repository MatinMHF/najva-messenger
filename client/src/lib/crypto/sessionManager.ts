/**
 * Message send/receive seam. Real E2EE per docs/ENCRYPTION.md: content is
 * AES-256-GCM encrypted under the conversation's current CK (see messageCrypto)
 * before it leaves the client, and decrypted on receive. The server only ever
 * sees base64 ciphertext + iv + the CK version.
 */
import api from '../api';
import { encryptContent, decryptContent, type DecryptedContent, type DecryptableMessage } from './messageCrypto';

/**
 * Encrypt `text` under the conversation's current CK version and post it.
 * Returns the created message row (with server id/timestamps).
 */
export const sendEncrypted = async (conversationId: string, version: number, text: string, replyToId?: string) => {
  const { encryptedContent, iv, senderKeyVersion } = await encryptContent(conversationId, version, text);
  const res = await api.post(`/conversations/${conversationId}/messages`, {
    type: 'TEXT',
    encryptedContent,
    iv,
    senderKeyVersion,
    replyToId,
  });
  return res.data;
};

/**
 * Send a typed message (media/file) that references already-uploaded encrypted
 * attachments. `caption` (often the file name) is E2EE like any text content so
 * the row always carries valid ciphertext bound to the conversation.
 */
export const sendEncryptedMessage = async (
  conversationId: string,
  version: number,
  opts: { type: string; caption?: string; attachmentIds?: string[]; replyToId?: string },
) => {
  const { encryptedContent, iv, senderKeyVersion } = await encryptContent(
    conversationId, version, opts.caption ?? '',
  );
  const res = await api.post(`/conversations/${conversationId}/messages`, {
    type: opts.type,
    encryptedContent,
    iv,
    senderKeyVersion,
    attachmentIds: opts.attachmentIds,
    replyToId: opts.replyToId,
  });
  return res.data;
};

/** Decrypt a stored/received message to plaintext (or an undecryptable marker). */
export const decryptMessage = (
  conversationId: string,
  msg: DecryptableMessage,
): Promise<DecryptedContent> => decryptContent(conversationId, msg);
