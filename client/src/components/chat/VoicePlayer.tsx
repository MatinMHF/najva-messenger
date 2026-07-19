import React, { useEffect, useRef, useState } from 'react';

interface VoicePlayerProps {
  url: string;
  msgTime?: string;
  isMine?: boolean;
}

const VoicePlayer: React.FC<VoicePlayerProps> = ({ url, msgTime, isMine }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const speakerOut = localStorage.getItem('najva-speakerOut');
    if (audioRef.current && speakerOut && speakerOut !== 'System default') {
      const audioEl = audioRef.current as any;
      if (typeof audioEl.setSinkId === 'function') {
        audioEl.setSinkId(speakerOut).catch(console.warn);
      }
    }
  }, [url]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.warn);
    }
    setPlaying(!playing);
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      if (audioRef.current.duration !== Infinity) {
        setDuration(audioRef.current.duration);
      } else {
        // Chromium bug with webm duration sometimes
        audioRef.current.currentTime = 1e8;
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setDuration(audioRef.current.duration);
          }
        }, 100);
      }
    }
  };

  const onEnded = () => {
    setPlaying(false);
    setProgress(0);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Generate some deterministic random bars based on duration or just a static nice wave
  const numBars = 35;
  const bars = Array.from({ length: numBars }).map((_, i) => {
    // A simple sine wave envelope with some pseudo-randomness for a waveform look
    const p = i / numBars;
    const h = 4 + 20 * Math.sin(p * Math.PI) * (0.4 + 0.6 * (Math.sin(i * 1.5) ** 2));
    const played = duration > 0 && (i / numBars) <= (progress / duration);
    return {
      h: `${Math.max(4, h)}px`,
      c: played ? 'currentColor' : (isMine ? 'rgba(255,255,255,0.45)' : 'var(--nj-muted, rgba(30,138,150,0.45))')
    };
  });

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '10px',
      padding: '10px 14px',
      borderRadius: isMine ? '14px 14px 0 14px' : '14px 14px 14px 0',
      color: isMine ? '#ffffff' : 'var(--nj-ink, #dcf0f2)',
      background: isMine ? 'linear-gradient(135deg, #1e8a96, #14707c)' : 'var(--nj-panel, #112429)',
      boxShadow: '0 2px 8px -4px rgba(10,40,46,0.25)',
      animation: 'najva-bubble 0.3s ease both'
    }}>
      <button 
        onClick={togglePlay} 
        style={{ 
          width: '36px', height: '36px', borderRadius: '50%', border: 'none', 
          flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', 
          justifyContent: 'center', color: '#14707c', background: 'rgba(255,255,255,0.92)' 
        }}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>
        )}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '26px' }}>
        {bars.map((b, i) => (
          <div key={i} style={{ width: '3px', borderRadius: '2px', height: b.h, background: b.c }}></div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', minWidth: '35px' }}>
        <span style={{ fontSize: '0.7188rem', fontWeight: 700, opacity: 0.9, fontVariantNumeric: 'tabular-nums' }}>
          {playing ? formatTime(progress) : formatTime(duration)}
        </span>
        {msgTime && <span style={{ fontSize: '0.6563rem', opacity: 0.65 }}>{msgTime}</span>}
      </div>
      <audio 
        ref={audioRef} 
        src={url} 
        onTimeUpdate={onTimeUpdate} 
        onLoadedMetadata={onLoadedMetadata} 
        onEnded={onEnded} 
        hidden 
      />
    </div>
  );
};

export default VoicePlayer;
