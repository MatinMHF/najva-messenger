import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import './ProfilePage.css';

const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const Caret = () => (
  <svg className="caret" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
);

export default function MyProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  if (!user) return null;

  const avatar = user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.username)}&background=1F8A96&color=fff&size=128`;

  return (
    <div className="profile-page app-container">
      <div className="profile-shell">
        <div className="profile-topbar">
          <button className="profile-back-btn" onClick={() => navigate('/chat')} aria-label={t('common.back', 'Back')}>
            <BackIcon />
          </button>
          <h1>{t('profile.myProfile', 'My Profile')}</h1>
        </div>

        <div className="glass-panel profile-hero">
          <div className="profile-avatar-ring">
            <img src={avatar} alt={user.displayName || user.username} />
          </div>
          <h2 className="profile-name">{user.displayName || user.username}</h2>
          <p className="profile-username">@{user.username}</p>
          <div className="profile-status online"><span className="dot" />{t('chat.online', 'Online')}</div>

          <div className="profile-bio">
            <label>{t('profile.bio', 'Bio')}</label>
            {user.bio
              ? <p>{user.bio}</p>
              : <p className="muted">{t('profile.noBio', 'No bio provided.')}</p>}
          </div>
        </div>

        <div className="glass-panel profile-actions">
          <button className="profile-action" onClick={() => navigate('/settings/edit-profile')}>
            <span className="chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </span>
            <span className="label">{t('profile.editProfile', 'Edit Profile')}</span>
            <Caret />
          </button>

          <button className="profile-action" onClick={() => navigate('/settings')}>
            <span className="chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </span>
            <span className="label">{t('settings.title', 'Settings')}</span>
            <Caret />
          </button>

          <button className="profile-action" onClick={() => navigate('/settings/recovery-codes')}>
            <span className="chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </span>
            <span className="label">{t('profile.recoveryCodes', 'Recovery Codes')}</span>
            <Caret />
          </button>
        </div>

        <div className="glass-panel profile-actions">
          <button className="profile-action danger" onClick={() => { logout(); navigate('/login'); }}>
            <span className="chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </span>
            <span className="label">{t('common.logout', 'Log Out')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
