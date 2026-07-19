import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Phone } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useChatStore } from '../../store/chatStore';
import { useContactsStore } from '../../store/contactsStore';
import { acceptCall, rejectCall, endCall, toggleMic, toggleCam, toggleScreenShare } from '../../lib/calls/callController';
import VideoTile from './VideoTile';
import { initialsOf, avatarGradient } from '../../utils/avatar';

/**
 * Global call UI (Module D). Renders nothing when idle; an incoming-call prompt
 * when ringing; and a full-screen call view (local preview + remote peer tiles +
 * controls) while connecting/active.
 */
const CallOverlay: React.FC = () => {
  const { t } = useTranslation();
  const { status, incoming, localStream, localScreenStream, remotePeers, micEnabled, camEnabled, screenSharing, callType } = useCallStore();

  const overlayRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (status === 'idle' || status === 'ended') return null;

  if (status === 'incoming' && incoming) {
    const who = incoming.callerName || incoming.callerId;
    return (
      <div className="call-overlay" style={overlayStyle}>
        <span style={pillStyle}>
          {t('call.incoming', 'Incoming call')} · {incoming.type === 'video' ? t('call.video', 'Video') : t('call.audio', 'Audio')}
        </span>
        <div className="animate-pulse-ring" style={{ ...callAvatar, background: avatarGradient(who) }}>{initialsOf(who)}</div>
        <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 4 }}>{who}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{t('call.ringing', 'Ringing…')}</span>
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', marginTop: 30 }}>
          <button onClick={() => void acceptCall()} className="press" style={{ ...roundBtn, background: 'linear-gradient(135deg, #1e8a96, #14707c)' }} aria-label={t('call.accept', 'Accept')}>
            <Phone size={24} color="#fff" />
          </button>
          <button onClick={rejectCall} className="press" style={{ ...roundBtn, background: 'linear-gradient(135deg, #e05242, #c0392b)' }} aria-label={t('call.reject', 'Reject')}>
            <PhoneOff size={24} color="#fff" />
          </button>
        </div>
      </div>
    );
  }

  const toggleFullscreen = () => {
    const el = overlayRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error('Failed to enter fullscreen:', err);
      });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(err => {
        console.error('Failed to exit fullscreen:', err);
      });
    }
  };

  const peers = Object.values(remotePeers);

  // Construct all available tiles
  const tiles: { id: string; stream: MediaStream | null; label: string; mirror?: boolean; objectFit?: 'cover' | 'contain' }[] = [];

  // Local camera tile (always included so the avatar placeholder shows for audio calls too)
  tiles.push({ id: 'local-cam', stream: localStream, label: t('call.you', 'You'), mirror: true });

  // Local shared screen tile
  if (localScreenStream) {
    tiles.push({ id: 'local-screen', stream: localScreenStream, label: t('call.yourScreen', 'Your Screen'), objectFit: 'contain' });
  }

  // Helper to resolve display name/username from peer user ID (UUID)
  const resolvePeerUsername = (userId: string): string => {
    // 1. Search in contacts
    const contact = useContactsStore.getState().contacts.find(c => c.id === userId || c.username === userId);
    if (contact) return contact.displayName || contact.username;

    // 2. Search in chats
    const chats = Object.values(useChatStore.getState().chats);
    const matchedChat = chats.find(c => c.peerId === userId);
    if (matchedChat) {
      return matchedChat.name || matchedChat.participants[0] || userId;
    }

    // 3. Fallback
    return userId;
  };

  // Remote peers tiles
  peers.forEach((p) => {
    const resolvedName = resolvePeerUsername(p.userId);
    tiles.push({ id: `peer-${p.peerId}`, stream: p.stream, label: resolvedName });
  });

  const activeFocused = focusedTileId ? tiles.find(t => t.id === focusedTileId) : null;

  const handleTileClick = (id: string) => {
    setFocusedTileId(prev => (prev === id ? null : id));
  };

  return (
    <div ref={overlayRef} className="call-overlay" style={overlayStyle}>
      {/* Fullscreen Button */}
      <button
        onClick={toggleFullscreen}
        className="press nj-btn-hover"
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255, 255, 255, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          zIndex: 100,
          transition: 'background 0.15s, transform 0.15s'
        }}
        title={isFullscreen ? t('call.exit_fullscreen', 'Exit Fullscreen') : t('call.enter_fullscreen', 'Fullscreen')}
      >
        {isFullscreen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3M10 21v-6H4M14 3v6h6M20 9l-6-6M4 20l6-6" />
          </svg>
        )}
      </button>

      {/* Video Content Grid or Speaker View */}
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '72px 24px 24px', overflow: 'hidden' }}>
        {activeFocused ? (
          <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: '#000' }}>
            <VideoTile
              stream={activeFocused.stream}
              muted={activeFocused.id.startsWith('local')}
              label={activeFocused.label}
              mirror={activeFocused.mirror}
              onClick={() => handleTileClick(activeFocused.id)}
              objectFit="contain"
            />
            {/* Floating PiP Thumbnails Stack (on top of the big focused screen in the bottom-right) */}
            <div style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 50, width: '160px', maxHeight: '75%', overflowY: 'auto', paddingRight: '4px' }}>
              {tiles.filter(t => t.id !== activeFocused.id).map((t) => (
                <div key={t.id} style={{ width: '100%', height: '100px', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                  <VideoTile
                    stream={t.stream}
                    muted={t.id.startsWith('local')}
                    label={t.label}
                    mirror={t.mirror}
                    onClick={() => handleTileClick(t.id)}
                    objectFit={t.objectFit}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Normal Equal Grid View */
          <div style={{ flex: 1, display: 'grid', gap: 16, gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`, alignContent: 'center', overflowY: 'auto' }}>
            {tiles.map((t) => (
              <VideoTile
                key={t.id}
                stream={t.stream}
                muted={t.id.startsWith('local')}
                label={t.label}
                mirror={t.mirror}
                onClick={() => handleTileClick(t.id)}
                objectFit={t.objectFit}
              />
            ))}
            {tiles.length === 0 && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.75)' }}>
                <div className="animate-pulse-ring" style={{ ...callAvatar, width: 96, height: 96, fontSize: 30 }}>{initialsOf(t('call.you', 'You'))}</div>
                <span style={{ fontWeight: 700 }}>{status === 'connecting' ? t('call.connecting', 'Connecting…') : t('call.waiting', 'Waiting for others to join…')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={controlBarStyle}>
        <button onClick={toggleMic} className="press" style={{ ...roundBtn, background: micEnabled ? 'rgba(255,255,255,0.12)' : 'var(--error-color)' }} aria-label={t('call.toggle_mic', 'Toggle microphone')}>
          {micEnabled ? <Mic size={22} color="#fff" /> : <MicOff size={22} color="#fff" />}
        </button>
        {callType === 'video' && (
          <button onClick={toggleCam} className="press" style={{ ...roundBtn, background: camEnabled ? 'rgba(255,255,255,0.12)' : 'var(--error-color)' }} aria-label={t('call.toggle_cam', 'Toggle camera')}>
            {camEnabled ? <Video size={22} color="#fff" /> : <VideoOff size={22} color="#fff" />}
          </button>
        )}
        <button onClick={() => void toggleScreenShare()} className="press" style={{ ...roundBtn, background: screenSharing ? 'var(--color-orange)' : 'rgba(255,255,255,0.12)' }} aria-label={t('call.share_screen', 'Share screen')}>
          <Monitor size={22} color="#fff" />
        </button>
        <button onClick={endCall} className="press" style={{ ...roundBtn, background: 'linear-gradient(135deg, #e05242, #c0392b)' }} aria-label={t('call.hang_up', 'Hang up')}>
          <PhoneOff size={22} color="#fff" />
        </button>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  background: 'linear-gradient(160deg, #0b2a30 0%, #08181c 100%)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
};
const pillStyle: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)', padding: '5px 16px', borderRadius: 12,
};
const callAvatar: React.CSSProperties = {
  width: 112, height: 112, borderRadius: '50%', display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontSize: 36, fontWeight: 800, color: '#fff', marginTop: 10,
};
const controlBarStyle: React.CSSProperties = {
  display: 'flex', gap: 16, padding: '14px 22px', margin: '0 0 28px', justifyContent: 'center',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 999, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  zIndex: 10,
};
const roundBtn: React.CSSProperties = {
  width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default CallOverlay;
