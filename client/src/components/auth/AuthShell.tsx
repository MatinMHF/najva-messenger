import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import '../../styles/najva-auth.css';

/**
 * Shared Najva auth surface: animated gradient + drifting blobs and the
 * top-right theme / language controls. Wraps the card content of each auth page
 * (Register, Recovery). Login keeps its own inline shell.
 */
const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme, language, setLanguage } = useUIStore();
  const { i18n, t } = useTranslation();
  const isDark = theme === 'dark';

  const toggleLanguage = () => {
    const next = language === 'fa' ? 'en' : 'fa';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  React.useEffect(() => {
    document.body.classList.toggle('dark-theme', isDark);
  }, [isDark]);

  return (
    <div className="najva-auth">
      <div className="najva-blob najva-blob-a" />
      <div className="najva-blob najva-blob-b" />

      <button
        type="button"
        className="najva-round-btn najva-lang-btn"
        onClick={toggleLanguage}
        title={t('common.toggle_language', 'Toggle language')}
        aria-label={t('common.toggle_language', 'Toggle language')}
      >
        <span key={language}>{language === 'fa' ? 'EN' : 'فا'}</span>
      </button>

      <button
        type="button"
        className="najva-round-btn najva-theme-btn"
        onClick={toggleTheme}
        title={t('common.toggle_theme', 'Toggle theme')}
        aria-label={t('common.toggle_theme', 'Toggle theme')}
      >
        {isDark ? <Moon key="dark" size={21} /> : <Sun key="light" size={21} />}
      </button>

      {children}
    </div>
  );
};

export default AuthShell;
