import './Avatar.css';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
  className?: string;
}

export default function Avatar({ src, name, size = 'md', status, className = '' }: AvatarProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Generate a random background color based on name
  const getBgColor = (name: string) => {
    const colors = ['#6C63FF', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  return (
    <div className={`avatar avatar-${size} ${className}`}>
      {src ? (
        <img src={src} alt={name} className="avatar-img" loading="lazy" />
      ) : (
        <div className="avatar-fallback" style={{ backgroundColor: getBgColor(name) }}>
          {getInitials(name)}
        </div>
      )}
      {status && <span className={`avatar-status status-${status}`} />}
    </div>
  );
}
