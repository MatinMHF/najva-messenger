import React from 'react';
import LoginForm from '../components/auth/LoginForm';
import { useUIStore } from '../store/uiStore';
import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import './LoginPage.css';

const LoginPage: React.FC = () => {
  const { theme, toggleTheme, language, setLanguage } = useUIStore();
  const { i18n, t } = useTranslation();
  const isDark = theme === 'dark';

  const toggleLanguage = () => {
    const newLang = language === 'fa' ? 'en' : 'fa';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
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

      <LoginForm />
    </div>
  );
};

export default LoginPage;
