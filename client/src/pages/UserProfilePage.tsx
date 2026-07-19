import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useContactsStore } from '../store/contactsStore';
import { createDirectConversation } from '../lib/conversations';
import { formatLastSeen } from '../utils/timeFormat';
import type { User } from '../store/authStore';
import './ProfilePage.css';

const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const Caret = () => (
  <svg className="caret" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
);

export default function UserProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const me = useAuthStore((s) => s.user);
  const contacts = useContactsStore();

  const [user, setUser] = useState<Partial<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Viewing your own id should land on the self profile.
    if (userId && me && userId === me.id) { navigate('/me', { replace: true }); return; }
    let alive = true;
    setLoading(true);
    api.get(`/users/${userId}`)
      .then((res) => { if (alive) { setUser(res.data); setError(''); } })
      .catch(() => { if (alive) setError(t('profile.notFound', 'User not found.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, me, navigate, t]);

  const openConversation = async () => {
    if (!me || !userId || starting) return;
    setStarting(true);
    try {
      const conv = await createDirectConversation(me.id, userId);
      navigate(`/chat/${conv.id}`);
    } catch {
      setError(t('profile.messageFailed', 'Could not open the conversation.'));
      setStarting(false);
    }
  };

  if (loading) return <div className="profile-page app-container"><p className="profile-loading">{t('common.loading', 'Loading…')}</p></div>;
  if (error || !user) return (
    <div className="profile-page app-container">
      <div className="profile-shell">
        <div className="profile-topbar">
          <button className="profile-back-btn" onClick={() => navigate(-1)} aria-label={t('common.back', 'Back')}><BackIcon /></button>
          <h1>{t('profile.title', 'User Info')}</h1>
        </div>
        <div className="glass-panel profile-hero"><p className="profile-error">{error || t('profile.notFound', 'User not found.')}</p></div>
      </div>
    </div>
  );

  const isContact = user.id ? contacts.isContact(user.id) : false;
  const online = user.status === 'ONLINE';
  const avatar = user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.username || '')}&background=1F8A96&color=fff&size=128`;

  return (
    <div className="profile-page app-container">
      <div className="profile-shell">
        <div className="profile-topbar">
          <button className="profile-back-btn" onClick={() => navigate(-1)} aria-label={t('common.back', 'Back')}><BackIcon /></button>
          <h1>{t('profile.title', 'User Info')}</h1>
        </div>

        <div className="glass-panel profile-hero">
          <div className="profile-avatar-ring">
            <img src={avatar} alt={user.displayName || user.username} />
          </div>
          <h2 className="profile-name">{user.displayName || user.username}</h2>
          <p className="profile-username">@{user.username}</p>
          <div className={`profile-status ${online ? 'online' : ''}`}>
            <span className="dot" />
            {online ? t('chat.online', 'Online') : formatLastSeen(user.lastSeen || null, user.status || 'OFFLINE', t)}
          </div>

          <div className="profile-bio">
            <label>{t('profile.bio', 'Bio')}</label>
            {user.bio ? <p>{user.bio}</p> : <p className="muted">{t('profile.noBio', 'No bio provided.')}</p>}
          </div>

          <div className="profile-cta-row">
            <button className="profile-cta primary" onClick={openConversation} disabled={starting}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              {starting ? t('common.loading', 'Loading…') : t('profile.sendMessage', 'Send Message')}
            </button>
          </div>
        </div>

        <div className="glass-panel profile-actions">
          {isContact ? (
            <button className="profile-action" onClick={() => user.id && contacts.removeContact(user.id)}>
              <span className="chip"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="23" y1="11" x2="17" y2="11" /></svg></span>
              <span className="label">{t('chat.removeContact', 'Remove Contact')}</span>
            </button>
          ) : (
            <button className="profile-action" onClick={() => user.id && user.username && contacts.addContact({ id: user.id, username: user.username, displayName: user.displayName || user.username })}>
              <span className="chip"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg></span>
              <span className="label">{t('chat.addContact', 'Add Contact')}</span>
            </button>
          )}

          <button className="profile-action" onClick={() => navigate(`/u/${userId}/more`)}>
            <span className="chip"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg></span>
            <span className="label">{t('profile.more', 'More')}</span>
            <Caret />
          </button>
        </div>
      </div>
    </div>
  );
}
