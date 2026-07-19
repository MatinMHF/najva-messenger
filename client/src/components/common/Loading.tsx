import './Loading.css';

interface LoadingProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export default function Loading({ fullScreen = false, size = 'md', text }: LoadingProps) {
  const containerClass = fullScreen ? 'loading-fullscreen' : 'loading-container';

  return (
    <div className={containerClass}>
      <div className={`loading-spinner spinner-${size}`} />
      {text && <p className="loading-text">{text}</p>}
    </div>
  );
}
