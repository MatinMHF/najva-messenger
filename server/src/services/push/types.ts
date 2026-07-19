/**
 * Push payloads carry METADATA ONLY. Message content is E2EE — the server holds
 * only ciphertext — so a notification never includes message text. `title` is a
 * metadata field the server legitimately knows (sender display name); `body` is
 * a generic, localized-on-client cue. The client fetches + decrypts on open.
 */
export interface PushPayload {
  title: string; // e.g. sender display name (metadata, never message content)
  body: string; // generic cue key/text, e.g. "new_message"
  kind: 'message' | 'call' | 'system';
  conversationId?: string;
  actorId?: string;
}

export interface PushResult {
  ok: boolean;
  gone: boolean; // endpoint/token is dead (404/410) -> caller prunes it
}
