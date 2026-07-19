import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';

export default function TwoFactorPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const { theme, toggleTheme, language, setLanguage } = useUIStore();
  
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isEnabled = user?.totpEnabled;
  const dir = language === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    if (!isEnabled && !setupData) {
      initSetup();
    }
  }, [isEnabled]);

  const initSetup = async () => {
    try {
      const res = await api.post('/auth/2fa/setup');
      setSetupData(res.data);
    } catch (err: any) {
      setError(t('2fa.init_failed', 'Failed to initialize 2FA setup'));
    }
  };

  const toggleLanguage = () => {
    const lang = language === 'fa' ? 'en' : 'fa';
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await api.post('/auth/2fa/verify', { code });
      updateUser({ totpEnabled: true });
      setSuccess(t('2fa.enabled_success', 'Two-Factor Authentication enabled successfully!'));
      setSetupData(null);
      setCode('');
    } catch (err: any) {
      setError(err.response?.data?.message || t('2fa.invalid_code', 'Invalid verification code'));
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.MouseEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await api.post('/auth/2fa/disable', { code });
      updateUser({ totpEnabled: false });
      setSuccess(t('2fa.disabled_success', 'Two-Factor Authentication disabled.'));
      setCode('');
      initSetup();
    } catch (err: any) {
      setError(err.response?.data?.message || t('2fa.invalid_code', 'Invalid verification code'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Controls */}
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

      <div className="auth-page" dir={dir}>
        <div className="auth-card" style={{ maxWidth: '480px' }}>
          
          <h2 id="title-2fa" className="auth-title" style={{ marginBottom: '0.5rem', textAlign: 'center' }}>
            {language === 'fa' ? 'تایید دو مرحله‌ای (2FA)' : 'Two-Factor Authentication (2FA)'}
          </h2>
          <p id="subtitle-2fa" className="auth-subtitle" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
            {isEnabled 
              ? (language === 'fa' ? 'تایید دو مرحله‌ای فعال است.' : 'Two-Factor Authentication is enabled.') 
              : (language === 'fa' ? 'برای افزایش امنیت حساب خود، این قابلیت را فعال کنید.' : 'Enable this feature to enhance your account security.')}
          </p>

          {error && (
            <div className="alert-error mb-3" style={{ textAlign: language === 'fa' ? 'right' : 'left' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert-success mb-3" style={{ color: 'var(--color-success)', padding: '1rem', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', textAlign: 'center', justifyContent: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <span>{success}</span>
            </div>
          )}

          {!isEnabled && setupData && (
            <div className="qr-code-container" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
              <div className="qr-code-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto', width: '150px', height: '150px' }}>
                <QRCodeSVG value={setupData.otpauthUrl} size={150} level="M" />
              </div>
              <p id="scan-qr-text" className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
                {language === 'fa' ? 'کد مقابل را با اپلیکیشن احراز هویت (مثل Google Authenticator) اسکن کنید.' : 'Scan the QR code with an authenticator app (like Google Authenticator).'}
              </p>
              <p id="enter-key-text" className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
                {language === 'fa' ? 'یا کد زیر را به صورت دستی وارد کنید:' : 'Or enter the code below manually:'}
              </p>
              <div className="secret-key-box" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-color)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '1px', color: 'var(--text-main)', userSelect: 'all', direction: 'ltr' }}>
                {setupData.secret}
              </div>
            </div>
          )}
          
          <form onSubmit={handleVerify} className="auth-form">
            
            <div className="form-group">
              <label id="verify-code-lbl" htmlFor="verify-code" style={{ textAlign: 'center' }}>
                {language === 'fa' ? 'کد تایید ۶ رقمی' : '6-Digit Verification Code'}
              </label>
              <input 
                type="text" 
                id="verify-code" 
                maxLength={6} 
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={language === 'fa' ? 'کد را وارد کنید' : 'Enter code'} 
                style={{ textAlign: 'center', letterSpacing: '0.5rem', fontSize: '1.2rem', fontWeight: 600 }} 
                required
              />
            </div>

            <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {!isEnabled && (
                <button id="btn-enable" type="submit" className="btn-primary" disabled={loading}>
                  {loading ? t('common.loading', 'Loading...') : (language === 'fa' ? 'تایید و فعال‌سازی' : 'Verify & Enable')}
                </button>
              )}
              {isEnabled && (
                <button id="btn-disable" type="button" onClick={handleDisable} className="btn-danger" style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--error-color)', color: 'white', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', transition: 'background 0.2s ease, transform 0.1s', fontFamily: 'inherit', textAlign: 'center', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', width: '100%' }} disabled={loading}>
                  {loading ? t('common.loading', 'Loading...') : (language === 'fa' ? 'غیرفعال کردن تایید دو مرحله‌ای' : 'Disable 2FA')}
                </button>
              )}
              <button 
                id="btn-cancel" 
                type="button" 
                className="btn-secondary" 
                style={{ textDecoration: 'none' }}
                onClick={() => navigate('/settings')}
              >
                {language === 'fa' ? 'بازگشت' : 'Back'}
              </button>
            </div>

          </form>
          
        </div>
      </div>
    </>
  );
}
