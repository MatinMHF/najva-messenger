import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { formatLastSeen } from '../utils/timeFormat';
import type { User } from '../store/authStore';
import './ProfilePage.css';

const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);

/** Read-only detail sheet for a user, reached via UserProfilePage → "More". */
export default function UserMorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const [user, setUser] = useState<Partial<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/users/${userId}`)
      .then((res) => { if (alive) { setUser(res.data); setError(''); } })
      .catch(() => { if (alive) setError(t('profile.notFound', 'User not found.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, t]);

  const online = user?.status === 'ONLINE';

  return (
    <div className="profile-page app-container">
      <div className="profile-shell">
        <div className="profile-topbar">
          <button className="profile-back-btn" onClick={() => navigate(-1)} aria-label={t('common.back', 'Back')}><BackIcon /></button>
          <h1>{t('profile.details', 'Details')}</h1>
        </div>

        {loading && <div className="glass-panel profile-hero"><p className="profile-loading">{t('common.loading', 'Loading…')}</p></div>}
        {!loading && (error || !user) && <div className="glass-panel profile-hero"><p className="profile-error">{error || t('profile.notFound', 'User not found.')}</p></div>}

        {!loading && user && (
          <>
            <div className="glass-panel profile-hero" style={{ paddingBottom: '1.25rem' }}>
              <div className="profile-avatar-ring" style={{ boxShadow: 'none' }}>
                <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.username || '')}&background=1F8A96&color=fff&size=128`} alt={user.displayName || user.username} />
              </div>
              <h2 className="profile-name">{user.displayName || user.username}</h2>
              <p className="profile-username">@{user.username}</p>
            </div>

            <div className="glass-panel profile-actions" style={{ padding: '0.35rem 0.75rem' }}>
              <div className="profile-action" style={{ cursor: 'default' }}>
                <span className="label">{t('profile.username', 'Username')}</span>
                <span dir="ltr" style={{ color: 'var(--text-secondary)' }}>@{user.username}</span>
              </div>
              <div className="profile-action" style={{ cursor: 'default' }}>
                <span className="label">{t('profile.presence', 'Presence')}</span>
                <span style={{ color: online ? 'var(--color-teal)' : 'var(--text-secondary)' }}>
                  {online ? t('chat.online', 'Online') : formatLastSeen(user.lastSeen || null, user.status || 'OFFLINE', t)}
                </span>
              </div>
              <div className="profile-action" style={{ cursor: 'default' }}>
                <span className="label">{t('profile.twoFactor', 'Two-factor auth')}</span>
                {user.totpEnabled
                  ? <span className="profile-badge">{t('profile.enabled', 'Enabled')}</span>
                  : <span style={{ color: 'var(--text-secondary)' }}>{t('profile.disabled', 'Disabled')}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
