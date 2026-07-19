import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';

export default function RecoveryCodesPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { recoveryCodes, setRecoveryCodes } = useAuthStore();
  const { theme, toggleTheme, language, setLanguage } = useUIStore();
  
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const dir = language === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    if (!recoveryCodes || recoveryCodes.length === 0) {
      navigate('/chat');
    }
  }, [recoveryCodes, navigate]);

  if (!recoveryCodes || recoveryCodes.length === 0) {
    return null;
  }

  const toggleLanguage = () => {
    const lang = language === 'fa' ? 'en' : 'fa';
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownload = () => {
    const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'najva-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (acknowledged) {
      setRecoveryCodes(null); // Clear codes from memory
      navigate('/chat');
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
        <div className="auth-card" style={{ maxWidth: '500px' }}>
          
          <h2 id="rc-title" className="auth-title" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
            {language === 'fa' ? 'کدهای بازیابی اضطراری' : 'Emergency Recovery Codes'}
          </h2>
          <p id="rc-subtitle" className="auth-subtitle" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            {language === 'fa' 
              ? 'این کدها را در مکانی امن ذخیره کنید. در صورت عدم دسترسی به تلفن همراه، می‌توانید از این کدها برای ورود استفاده کنید.' 
              : 'Store these codes in a safe place. If you lose access to your phone, you can use these codes to log in.'}
          </p>

          {/* Codes Grid */}
          <div className="codes-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {recoveryCodes.map((code, index) => (
              <div 
                key={index} 
                className="recovery-code-box"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '1px', color: 'var(--text-main)', textAlign: 'center', userSelect: 'all', direction: 'ltr', fontWeight: 600 }}
              >
                {code}
              </div>
            ))}
          </div>

          {/* Copy and Print Buttons */}
          <div className="actions-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <button 
              className="btn-secondary" 
              id="btn-copy" 
              onClick={handleCopy}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', height: '45px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span id="text-copy">
                {copied 
                  ? (language === 'fa' ? 'کپی شد!' : 'Copied!') 
                  : (language === 'fa' ? 'کپی کردن همه' : 'Copy All')}
              </span>
            </button>
            <button 
              className="btn-secondary" 
              id="btn-print" 
              onClick={handleDownload}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', height: '45px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              <span id="text-print">
                {language === 'fa' ? 'دانلود فایل متنی' : 'Download TXT'}
              </span>
            </button>
          </div>
          
          <form onSubmit={handleContinue} className="auth-form">
            {/* Acknowledgment checkbox */}
            <div 
              className="acknowledgment-box"
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(242, 140, 56, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-orange)' }}
            >
              <input 
                type="checkbox" 
                id="ack-checkbox" 
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                required
                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--color-orange)' }}
              />
              <label htmlFor="ack-checkbox" id="ack-label" style={{ fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', flex: 1 }}>
                {language === 'fa' ? 'من این کدها را در مکانی امن ذخیره کرده‌ام.' : 'I have saved these codes in a safe place.'}
              </label>
            </div>

            <div className="mt-3" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button 
                id="btn-finish" 
                type="submit" 
                className="btn-primary" 
                disabled={!acknowledged}
                style={{ 
                  opacity: acknowledged ? '1' : '0.6', 
                  cursor: acknowledged ? 'pointer' : 'not-allowed' 
                }}
              >
                {language === 'fa' ? 'ذخیره و اتمام' : 'Save & Finish'}
              </button>
            </div>
          </form>
          
        </div>
      </div>
    </>
  );
}