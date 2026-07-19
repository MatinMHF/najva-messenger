import React, { useEffect, useRef, useState } from 'react';

interface VideoPlayerProps {
  url: string;
  msgTime?: string;
  isMine?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, msgTime, isMine }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const speakerOut = localStorage.getItem('najva-speakerOut');
    if (videoRef.current && speakerOut && speakerOut !== 'System default') {
      const videoEl = videoRef.current as any;
      if (typeof videoEl.setSinkId === 'function') {
        videoEl.setSinkId(speakerOut).catch(console.warn);
      }
    }
  }, [url]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play().catch(console.warn);
      setPlaying(true);
    }
  };

  const onTimeUpdate = () => {
    if (videoRef.current) {
      setProgress(videoRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (videoRef.current) {
      if (videoRef.current.duration !== Infinity && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      } else {
        // Handle webm duration issues
        videoRef.current.currentTime = 1e8;
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            if (!isNaN(videoRef.current.duration)) {
              setDuration(videoRef.current.duration);
            }
          }
        }, 150);
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

  // Determine a nice gradient background for the tile from a pool of presets
  // using a simple hash of the URL to keep it consistent
  const getTileBg = (path: string) => {
    const gradients = [
      'linear-gradient(135deg, #2fa5b3, #14707c)',
      'linear-gradient(135deg, #f5a623, #c77f10)',
      'linear-gradient(135deg, #5b8f6b, #3f7350)',
      'linear-gradient(135deg, #b3672a, #8f4f1d)',
      'linear-gradient(135deg, #1e8a96, #0e4f58)',
      'linear-gradient(135deg, #88b8bd, #4a8790)'
    ];
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      hash = path.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % gradients.length;
    return gradients[idx];
  };

  const tileBg = getTileBg(url);
  const ringBg = 'linear-gradient(135deg, #1e8a96, #14707c)';

  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: isMine ? 'flex-end' : 'flex-start', 
        gap: '4px', 
        animation: 'najva-bubble 0.3s ease both' 
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div 
        style={{ 
          width: '168px', 
          height: '168px', 
          borderRadius: '50%', 
          padding: '4px', 
          background: ringBg,
          boxShadow: '0 3px 10px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div 
          style={{ 
            width: '100%', 
            height: '100%', 
            borderRadius: '50%', 
            position: 'relative', 
            overflow: 'hidden', 
            background: tileBg, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: 'pointer'
          }}
          onClick={togglePlay}
        >
          <video 
            ref={videoRef}
            src={url}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onEnded}
            playsInline
            muted={false} // Allow audio to play
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%',
              zIndex: 1,
              // Fade out video slightly when paused to make play button readable
              opacity: playing ? 1 : 0.85,
              transition: 'opacity 0.2s ease'
            }}
          />

          {/* Controls overlay */}
          <div 
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // Hide controls overlay if playing and not hovered
              opacity: !playing || hovered ? 1 : 0,
              transition: 'opacity 0.25s ease',
              backgroundColor: !playing ? 'rgba(0, 0, 0, 0.15)' : 'transparent'
            }}
          >
            <button 
              style={{ 
                width: '44px', 
                height: '44px', 
                borderRadius: '50%', 
                border: 'none', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: '#14707c', 
                background: 'rgba(255,255,255,0.92)',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                transform: playing ? 'scale(1)' : 'scale(1.05)',
                transition: 'transform 0.15s ease'
              }}
            >
              {playing ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7L8 5Z" />
                </svg>
              )}
            </button>

            <span 
              style={{ 
                position: 'absolute', 
                bottom: '12px', 
                left: '50%', 
                transform: 'translateX(-50%)', 
                fontSize: '0.6875rem', 
                fontWeight: 800, 
                color: '#fff', 
                background: 'rgba(5,22,26,0.65)', 
                padding: '2px 10px', 
                borderRadius: '9px', 
                whiteSpace: 'nowrap', 
                fontVariantNumeric: 'tabular-nums',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)'
              }}
            >
              {playing ? `${formatTime(progress)} / ${formatTime(duration)}` : formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
      {msgTime && (
        <span 
          style={{ 
            fontSize: '0.6563rem', 
            color: 'var(--nj-muted, #8aa8ac)',
            marginRight: isMine ? '8px' : '0',
            marginLeft: !isMine ? '8px' : '0',
          }}
        >
          {msgTime}
        </span>
      )}
    </div>
  );
};

export default VideoPlayer;
