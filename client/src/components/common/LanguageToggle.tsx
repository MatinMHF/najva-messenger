import React from 'react';
import { Languages } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useTranslation } from 'react-i18next';

export const LanguageToggle: React.FC = () => {
  const { language, setLanguage } = useUIStore();
  const { i18n } = useTranslation();

  const handleToggle = () => {
    const newLang = language === 'fa' ? 'en' : 'fa';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };
  
  return (
    <button 
      onClick={handleToggle} 
      className="toggle-btn"
      aria-label="Toggle Language"
      style={{
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: 0,
        fontWeight: 'bold',
        fontSize: '1rem'
      }}
    >
      <Languages size={24} />
      <span>{language === 'fa' ? 'EN' : 'فا'}</span>
    </button>
  );
};
