import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';

interface TopControlsProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Shared theme + language toggle used across the public/auth-adjacent pages
 * (previously copy-pasted per page). Renders the same `.top-controls` /
 * `.control-btn` markup those pages already style via styles/index.css.
 */
export const TopControls: React.FC<TopControlsProps> = ({ className, style }) => {
  const { theme, toggleTheme, language, setLanguage } = useUIStore();
  const { t, i18n } = useTranslation();

  const handleToggleLanguage = () => {
    const next = language === 'fa' ? 'en' : 'fa';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  return (
    <div className={['top-controls', className].filter(Boolean).join(' ')} style={style}>
      <button
        type="button"
        id="lang-toggle"
        onClick={handleToggleLanguage}
        className="control-btn"
        aria-label={t('common.toggle_language', 'Toggle Language')}
      >
        {language === 'fa' ? 'EN' : 'FA'}
      </button>
      <button
        type="button"
        id="theme-toggle"
        onClick={toggleTheme}
        className="control-btn"
        aria-label={t('common.toggle_theme', 'Toggle Theme')}
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </div>
  );
};

export default TopControls;
