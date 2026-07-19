import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import AttachmentMenu from './AttachmentMenu';
import { EMOJI_TABS } from './emojiData';
import { getMediaStream, mediaErrorMessage, savedAudioConstraint, savedVideoConstraint } from '../../lib/media';

interface MessageInputProps {
  onSend: (text: string) => void;
  onSendMedia?: (file: Blob, fileName: string, mime: string) => void | Promise<void>;
  showScrollDown?: boolean;
  scrollToLatest?: () => void;
}

interface PendingAttachment {
  id: string;
  name: string;
  file: File;
}

interface RecState { video: boolean; locked: boolean; }

const HOLD_MS = 260;      // press this long before a recording starts (shorter = a tap)
const LOCK_DY = 70;       // slide the pointer up this many px to lock hands-free

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Composer — faithful port of the Cloud Design footer, including the
 * press-and-hold voice/video recorder:
 *  - tap the mic/cam button toggles voice <-> video mode
 *  - press & hold records; release sends; slide up while holding to LOCK
 *    (hands-free) — then Cancel / Send explicitly
 *  - voice records inline (the composer morphs to a timer bar); video records
 *    in a full-screen overlay with a live camera preview
 * Real capture via getUserMedia + MediaRecorder; the finished Blob goes to
 * onSendMedia (real E2EE upload). ponytail: flip-camera is a cosmetic label/
 * mirror toggle — it does not re-open the stream mid-recording.
 */
const MessageInput: React.FC<MessageInputProps> = ({ onSend, onSendMedia, showScrollDown, scrollToLatest }) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [modeVideo, setModeVideo] = useState(false);
  const [rec, setRec] = useState<RecState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [camFront, setCamFront] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);

  // recording internals (refs so async media callbacks read fresh values)
  const recRef = useRef<RecState | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const pressY = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveRef = useRef<((e: MouseEvent | TouchEvent) => void) | null>(null);
  // async coordination: session for the in-flight getUserMedia
  const sessRef = useRef<{ cancelled: boolean } | null>(null);
  const sendOnStop = useRef(false);

  const hasText = message.trim().length > 0;
  const canSend = hasText || attachments.length > 0;
  recRef.current = rec;

  useEffect(() => {
    if (!emojiOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEmojiOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [emojiOpen]);

  useEffect(() => () => cleanupRec(), []); // unmount

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tk) => tk.stop());
    streamRef.current = null;
  };
  const removeMove = () => {
    if (moveRef.current) {
      window.removeEventListener('mousemove', moveRef.current);
      window.removeEventListener('touchmove', moveRef.current as any);
      moveRef.current = null;
    }
  };
  const cleanupRec = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    removeMove();
    stopStream();
    recorderRef.current = null;
  };

  // Acquire the mic/camera FIRST, then begin recording. This avoids the race
  // where releasing before the stream is ready yields an empty (unsent) clip.
  const startRec = async (video: boolean) => {
    const sess = { cancelled: false };
    sessRef.current = sess;
    
    // Set UI state immediately so the camera overlay/voice bar appears while waiting for stream/permissions
    const state: RecState = { video, locked: false };
    setRec(state); recRef.current = state;
    setElapsed(0);
    const start = Date.now();
    tickRef.current = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);

    let stream: MediaStream;
    try {
      const constraints: MediaStreamConstraints = video
        ? { video: savedVideoConstraint(), audio: savedAudioConstraint() }
        : { audio: savedAudioConstraint() };
      stream = await getMediaStream(constraints);
    } catch (err) {
      console.warn('[recorder] getUserMedia failed:', err);
      if (video) alert(mediaErrorMessage(err));
      sessRef.current = null;
      setRec(null); recRef.current = null;
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    // Released (or cancelled) while we were acquiring — abort cleanly, no phantom.
    if (sess.cancelled) {
      stream.getTracks().forEach((tk) => tk.stop());
      sessRef.current = null;
      setRec(null); recRef.current = null;
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    // Release any previous session's tracks before taking ownership. Overwriting
    // streamRef with a live stream still in it leaked the mic/camera: the tracks
    // stayed open with nothing left pointing at them, so the NEXT recording hit
    // "device already in use" — contended by this very page.
    stopStream();
    streamRef.current = stream;
    if (video && videoElRef.current) videoElRef.current.srcObject = stream;

    chunksRef.current = [];
    let recorder: MediaRecorder;
    let mimeType = video ? 'video/webm' : 'audio/webm';
    if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = video ? 'video/mp4' : 'audio/mp4';
    }
    
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (err) {
      console.warn('[recorder] MediaRecorder failed:', err);
      stopStream(); sessRef.current = null;
      setRec(null); recRef.current = null;
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const send = sendOnStop.current;
      const finalMime = recorder.mimeType || mimeType;
      const blob = new Blob(chunksRef.current, { type: finalMime });
      if (send && blob.size > 0 && onSendMedia) {
        const ext = finalMime.includes('mp4') ? 'mp4' : 'webm';
        const name = video ? `video-message.${ext}` : `voice-message.${ext}`;
        void onSendMedia(blob, name, blob.type);
      }
      // Stop THIS session's tracks, not whatever streamRef points at now — a
      // newer recording may already own the ref, and stopping that one would
      // kill the live mic while leaking ours.
      stream.getTracks().forEach((tk) => tk.stop());
      if (streamRef.current === stream) streamRef.current = null;
    };

    // slide-up-to-lock (hands-free)
    removeMove();
    const onMove = (e: MouseEvent | TouchEvent) => {
      const tp = (e as TouchEvent).touches?.[0];
      const y = tp ? tp.clientY : (e as MouseEvent).clientY;
      const cur = recRef.current;
      if (typeof y === 'number' && pressY.current != null && pressY.current - y > LOCK_DY && cur && !cur.locked) {
        const locked = { ...cur, locked: true };
        setRec(locked); recRef.current = locked;
      }
    };
    moveRef.current = onMove;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });

    // Timeslice so `ondataavailable` flushes periodically — a quick release then
    // yields a non-empty blob instead of an empty (unsent) clip on some browsers.
    recorder.start(250);
  };

  const stopRec = (send: boolean) => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    removeMove();
    setRec(null); recRef.current = null;
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      sendOnStop.current = send;
      try { r.stop(); } catch { /* already stopped */ }
      recorderRef.current = null;
    } else {
      stopStream();
    }
  };

  const onPress = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (recRef.current) return; // already recording (locked); ignore re-press
    pressY.current = e.clientY;
    heldRef.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { heldRef.current = true; void startRec(modeVideo); }, HOLD_MS);
  };
  const onRelease = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    const r = recRef.current;
    if (r && !r.locked) stopRec(true);           // release-to-send
    else if (!r) {
      if (sessRef.current) sessRef.current.cancelled = true; // cancel in-flight acquire
      if (!heldRef.current) setModeVideo((v) => !v);         // quick tap -> toggle mode
    }
    heldRef.current = false;
  };
  const onRecClick = () => {
    const r = recRef.current;
    if (r && r.locked && !r.video) stopRec(true); // tap the locked voice send button
  };

  const insertEmoji = (ch: string) => { setMessage((m) => m + ch); inputRef.current?.focus(); };

  const submit = () => {
    if (attachments.length > 0 && onSendMedia) {
      attachments.forEach((a) => { void onSendMedia(a.file, a.name, a.file.type || 'application/octet-stream'); });
    }
    const text = message.trim();
    if (text) onSend(text);
    setMessage('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  const handleFilesSelected = (files: File[]) => {
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({ id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, file })),
    ]);
  };
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const voiceInline = !!(rec && !rec.video);
  const recLocked = !!(rec && rec.locked);
  const hint = recLocked ? t('record.locked', 'Recording locked — tap send') : t('record.slideToLock', 'Release to send — slide up to lock');
  const recBtnIsSend = voiceInline && recLocked;

  return (
    <div className="message-input-wrapper" style={{ width: '100%', position: 'relative' }}>
      {showScrollDown && (
        <button type="button" className="scroll-down-btn" onClick={scrollToLatest} aria-label={t('chat.scrollToBottom', 'Scroll to bottom')}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
          </svg>
        </button>
      )}
      {attachments.length > 0 && (
        <div className="pending-attachments" style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 1.5rem', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-color)' }}>
          {attachments.map((att) => (
            <div key={att.id} className="pending-chip" title={att.name} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-input)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
              <span className="pending-chip-name">{att.name}</span>
              <button type="button" className="pending-chip-remove" aria-label="Remove attachment" onClick={() => removeAttachment(att.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        {voiceInline ? (
          <div className="nj-rec-bar">
            {recLocked && <button type="button" className="nj-rec-cancel" onClick={() => stopRec(false)}>{t('common.cancel', 'Cancel')}</button>}
            <span className="nj-rec-dot" />
            <span className="nj-rec-timer">{fmtDur(elapsed)}</span>
            <span className="nj-rec-hint">{hint}</span>
          </div>
        ) : (
          <>
            <AttachmentMenu onFilesSelected={handleFilesSelected} />
            <input
              ref={inputRef}
              type="text"
              className="msg-input search-input"
              placeholder={t('chat.typeMessage', 'Type a message...')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="nj-emoji-wrap" style={{ position: 'relative', display: 'flex' }}>
              <button type="button" className="icon-btn" aria-label="Emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
              </button>
              {emojiOpen && (
                <>
                  <div className="nj-emoji-backdrop" onClick={() => setEmojiOpen(false)} />
                  <div className="nj-emoji" role="dialog" aria-label={t('chat.emoji', 'Emoji')}>
                    <div className="nj-emoji-tabs">
                      {EMOJI_TABS.map((tab, i) => (
                        <button key={i} type="button" className={`nj-emoji-tab ${emojiTab === i ? 'active' : ''}`} onClick={() => setEmojiTab(i)} aria-label={`emoji category ${i + 1}`}>{tab.icon}</button>
                      ))}
                    </div>
                    <div className="nj-emoji-grid">
                      {EMOJI_TABS[emojiTab].emojis.map((ch, i) => (
                        <button key={i} type="button" className="nj-emoji-cell" onClick={() => insertEmoji(ch)}>{ch}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Send button, or the press-and-hold record button */}
        {canSend ? (
          <button type="submit" className="send-btn" aria-label={t('common.send', 'Send')} onClick={submit}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        ) : (
          <div className="nj-rec-wrap">
            {rec && !rec.video && !rec.locked && (
              <div className="nj-rec-lockchip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nj-teal)' }}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nj-muted)' }}><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            )}
            <button
              type="button"
              className={`vv-record-btn${voiceInline ? ' rec' : ''}`}
              aria-label={modeVideo ? t('record.videoMsg', 'Video message') : t('record.voiceMsg', 'Voice message')}
              title={modeVideo ? t('record.videoMsg', 'Video message') : t('record.voiceMsg', 'Voice message')}
              onPointerDown={onPress}
              onPointerUp={onRelease}
              onPointerCancel={onRelease}
              onClick={onRecClick}
              onContextMenu={(e) => e.preventDefault()}
            >
              {recBtnIsSend ? (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M3 11.5 21 3l-6 18-3.5-7L3 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
              ) : modeVideo ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M16 10.5 21 8v8l-5-2.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* full-screen video recording overlay */}
      {rec && rec.video && (
        <div className="nj-vrec-overlay" onPointerUp={onRelease}>
          <div className="nj-vrec-circle">
            <video ref={videoElRef} className="nj-vrec-video" autoPlay muted playsInline style={{ transform: camFront ? 'scaleX(-1)' : 'none' }} />
            <span className="nj-vrec-facing">{camFront ? t('record.front', 'Front camera') : t('record.rear', 'Rear camera')}</span>
          </div>
          <button type="button" className="nj-vrec-flip" onPointerUp={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setCamFront((v) => !v); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M5.5 12.5 4 16l3.5-.7M18.5 11.5 20 8l-3.5.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {t('record.flipCam', 'Flip camera')}
          </button>
          <div className="nj-vrec-timerrow"><span className="nj-vrec-dot" /><span className="nj-vrec-timer">{fmtDur(elapsed)}</span></div>
          {!recLocked && (
            <div className="nj-vrec-lockchip">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: '#fff' }}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(255,255,255,0.7)' }}><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          )}
          <span className="nj-vrec-hint">{hint}</span>
          <div className="nj-vrec-controls">
            <button type="button" className="nj-vrec-cancel" onPointerUp={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); stopRec(false); }} title={t('common.cancel', 'Cancel')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </button>
            {recLocked && (
              <button type="button" className="nj-vrec-send" onPointerUp={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); stopRec(true); }} title={t('common.send', 'Send')}>
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M3 11.5 21 3l-6 18-3.5-7L3 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageInput;
