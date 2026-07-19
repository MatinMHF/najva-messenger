import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import api from '../lib/api';

export default function EditProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const { theme, toggleTheme, language, setLanguage } = useUIStore();
  
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleLanguage = () => {
    const newLang = language === 'fa' ? 'en' : 'fa';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.put('/users/profile', { displayName, bio });
      updateUser(res.data);
      navigate('/settings');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="top-controls" style={{ direction: 'ltr' }}>
        <button 
          id="lang-toggle" 
          onClick={toggleLanguage} 
          className="control-btn" 
          aria-label="Toggle Language" 
          style={{ fontWeight: 'bold', fontSize: '0.9rem' }}
        >
          {language === 'fa' ? 'EN' : 'FA'}
        </button>
        <button 
          id="theme-toggle" 
          onClick={toggleTheme} 
          className="control-btn" 
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <svg id="sun-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          ) : (
            <svg id="moon-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          )}
        </button>
      </div>

      <div className="auth-page">
        <div className="auth-card">
          
          <h2 className="auth-title" style={{ textAlign: 'right', marginBottom: '1.5rem' }} data-i18n="edit_profile_title">
            {t('profile.editProfile', 'Edit Profile')}
          </h2>
          
          <form onSubmit={handleSave} className="auth-form">
            {error && <div style={{ color: 'var(--error-color)', marginBottom: '16px', textAlign: 'right' }}>{error}</div>}
            
            <div className="text-center mb-3">
              <div className="profile-avatar-wrapper" style={{ cursor: 'pointer' }}>
                <img 
                  src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${displayName || user?.username}&background=1F8A96&color=fff`} 
                  alt="Current Avatar" 
                  className="profile-avatar-large" 
                  style={{ width: '100px', height: '100px' }} 
                />
                <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--color-orange)', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-surface)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                </div>
              </div>
              <p className="text-muted mt-2" style={{ fontSize: '0.9rem' }} data-i18n="change_avatar_hint">
                {t('profile.change_avatar_hint', 'Click to change avatar')}
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="display-name" data-i18n="display_name_lbl">
                {t('auth.display_name', 'Display Name')}
              </label>
              <input 
                type="text" 
                id="display-name" 
                value={displayName} 
                onChange={(e) => setDisplayName(e.target.value)}
                data-i18n-placeholder="display_name_ph" 
                placeholder={t('auth.display_name_placeholder', 'Enter your public name')} 
              />
            </div>

            <div className="form-group">
              <label htmlFor="username_readonly" data-i18n="username_lbl">
                {t('profile.username', 'Username')}
              </label>
              <input 
                type="text" 
                id="username_readonly" 
                value={user?.username ? `@${user.username}` : ''} 
                readOnly 
                style={{ opacity: 0.7, cursor: 'not-allowed' }} 
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="bio-text" data-i18n="bio_lbl">
                {t('profile.bio', 'Bio')}
              </label>
              <textarea 
                id="bio-text" 
                rows={4} 
                value={bio} 
                onChange={(e) => setBio(e.target.value)}
                data-i18n-placeholder="bio_ph" 
                placeholder={t('profile.bio_placeholder', 'Write a little about yourself...')} 
              />
            </div>

            <div className="mt-3" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ flex: 2, height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid transparent' }} 
                data-i18n="save_changes_btn"
                disabled={loading}
              >
                {loading ? t('common.saving', 'Saving...') : t('profile.save', 'Save Changes')}
              </button>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ flex: 1, height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(4px)' }} 
                data-i18n="cancel_btn" 
                onClick={() => navigate('/settings')}
              >
                {t('cancel', 'Cancel')}
              </button>
            </div>

          </form>
          
        </div>
      </div>
    </>
  );
}