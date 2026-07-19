import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchDecryptedObjectUrl } from '../../lib/attachments';
import VoicePlayer from './VoicePlayer';
import VideoPlayer from './VideoPlayer';

export interface AttachmentInfo {
  id: string;
  encryptedKey: string;
  mimeType: string;
  fileName?: string;
}

interface Props {
  conversationId: string;
  keyVersion: number;
  attachment: AttachmentInfo;
  msgTime?: string;
  isMine?: boolean;
  isVoice?: boolean;
  isVideo?: boolean;
}

/**
 * Renders a message attachment by downloading its opaque encrypted blob and
 * decrypting it client-side into an object URL (revoked on unmount). Falls back
 * to a lock placeholder if the CK/FK can't be recovered.
 */
export const AttachmentView: React.FC<Props> = ({ conversationId, keyVersion, attachment, msgTime, isMine, isVoice, isVideo }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      // A transient blip (download/keys request racing a busy chat burst) used to
      // latch "unavailable" forever until remount/reload; retry a few times with
      // backoff so only a genuinely unrecoverable attachment shows the placeholder.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          created = await fetchDecryptedObjectUrl(
            conversationId, keyVersion, attachment.id, attachment.encryptedKey, attachment.mimeType,
          );
          if (cancelled) URL.revokeObjectURL(created);
          else setUrl(created);
          return;
        } catch (err) {
          console.warn(`[attachment] load failed (attempt ${attempt + 1}/3) id=${attachment.id} v${keyVersion}`, err);
          if (attempt < 2 && !cancelled) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          else if (!cancelled) setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [attachment.id, attachment.encryptedKey, conversationId, keyVersion, attachment.mimeType]);

  if (failed) return <span className="attachment-error">🔒 {t('chat.attachment_unavailable', 'Attachment unavailable')}</span>;
  if (!url) return <span className="attachment-loading">{t('common.loading', 'Loading…')}</span>;

  const mime = attachment.mimeType || '';
  if (mime.startsWith('image/')) {
    return (
      <div style={{ width: '240px', height: '170px', borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', position: 'relative', overflow: 'hidden', background: '#eef5f5', boxShadow: '0 2px 8px -4px rgba(10,40,46,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img style={{ width: '100%', height: '100%', objectFit: 'cover' }} src={url} alt={attachment.fileName || 'image'} />
        {msgTime && <span style={{ position: 'absolute', bottom: '8px', right: '10px', fontSize: '0.6563rem', fontWeight: 700, color: '#fff', background: 'rgba(5,22,26,0.5)', padding: '2px 8px', borderRadius: '8px' }}>{msgTime}</span>}
      </div>
    );
  }
  if (mime.startsWith('video/')) {
    if (isVideo || (attachment.fileName && attachment.fileName.trim().startsWith('video-message.'))) {
      return <VideoPlayer url={url} isMine={isMine} msgTime={msgTime} />;
    }
    return <video className="nj-att-video" src={url} controls ref={el => {
      const spk = localStorage.getItem('najva-speakerOut');
      if (el && spk && spk !== 'System default' && typeof (el as any).setSinkId === 'function') {
        (el as any).setSinkId(spk).catch(console.warn);
      }
    }} />;
  }
  if (mime.startsWith('audio/')) {
    if (isVoice || (attachment.fileName && attachment.fileName.trim().startsWith('voice-message.'))) {
      return <VoicePlayer url={url} isMine={isMine} msgTime={msgTime} />;
    }
    return <audio className="nj-att-audio" src={url} controls ref={el => {
      const spk = localStorage.getItem('najva-speakerOut');
      if (el && spk && spk !== 'System default' && typeof (el as any).setSinkId === 'function') {
        (el as any).setSinkId(spk).catch(console.warn);
      }
    }} />;
  }
  return (
    <a href={url} download={attachment.fileName || 'file'} className="bubble nj-att-file" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '11px', boxSizing: 'border-box' }}>
      <span className="nj-att-file-icon">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M14 3v4h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
        <span className="nj-att-file-name">{attachment.fileName || t('chat.download_file', 'Download file')}</span>
        {msgTime && <span style={{ fontSize: '0.7188rem', opacity: 0.75 }}>{msgTime}</span>}
      </span>
    </a>
  );
};

export default AttachmentView;
