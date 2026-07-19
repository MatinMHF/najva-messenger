import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useUIStore();
  
  return (
    <button 
      onClick={toggleTheme} 
      className="toggle-btn"
      aria-label="Toggle Theme"
      style={{
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0
      }}
    >
      {theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
    </button>
  );
};
