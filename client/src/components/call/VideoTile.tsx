import React, { useEffect, useReducer, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  muted?: boolean;
  label?: string;
  mirror?: boolean;
  onClick?: () => void;
  objectFit?: 'cover' | 'contain';
}

/** Binds a MediaStream to a <video> element and keeps it attached on change. */
const VideoTile: React.FC<Props> = ({ stream, muted, label, mirror, onClick, objectFit }) => {
  const ref = useRef<HTMLVideoElement>(null);
  // Bump on track add/remove/mute so hasVideo re-evaluates (the MediaStream
  // object identity doesn't change when a track goes live).
  const [, force] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    // Autoplay of an unmuted stream is blocked until a gesture; the call was
    // started/accepted by a click, so an explicit play() succeeds where the bare
    // `autoPlay` attribute silently fails — without it remote audio never starts.
    if (stream) console.log(`[tile] bind label=${label} muted=${muted} audio=${stream.getAudioTracks().length} video=${stream.getVideoTracks().length}`);
    el.play()
      .then(() => stream && console.log(`[tile] play OK label=${label} paused=${el.paused} volume=${el.volume} muted=${el.muted}`))
      .catch((e) => console.warn(`[tile] play FAILED label=${label}`, e?.name, e?.message));
    if (!stream) return;
    stream.addEventListener('addtrack', force);
    stream.addEventListener('removetrack', force);
    return () => {
      stream.removeEventListener('addtrack', force);
      stream.removeEventListener('removetrack', force);
    };
  }, [stream]);

  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  return (
    <div className="video-tile" onClick={onClick} style={{ position: 'relative', background: '#111', borderRadius: 12, overflow: 'hidden', width: '100%', height: '100%', minHeight: 160, cursor: onClick ? 'pointer' : 'default' }}>
      {/* Kept mounted and playing even with no video track so call AUDIO always
          flows; the avatar placeholder is layered over it, not swapped for it. */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{ width: '100%', height: '100%', objectFit: objectFit || 'cover', transform: mirror ? 'scaleX(-1)' : undefined, visibility: hasVideo ? 'visible' : 'hidden', position: hasVideo ? 'static' : 'absolute', pointerEvents: 'none' }}
      />
      {!hasVideo && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 160, color: '#888', pointerEvents: 'none' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
            {(label || '?').charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      {label && (
        <span style={{ position: 'absolute', bottom: 8, insetInlineStart: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 12, pointerEvents: 'none' }}>
          {label}
        </span>
      )}
    </div>
  );
};

export default VideoTile;
