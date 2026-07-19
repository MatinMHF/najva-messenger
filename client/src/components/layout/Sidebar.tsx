import React from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, Users, Settings, Phone, LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import './Sidebar.css';

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="Logo" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div className="logo-circle">{user?.displayName?.charAt(0)?.toUpperCase() || user?.username?.charAt(0)?.toUpperCase() || 'N'}</div>
        )}
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/chats" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} title={t('navigation.chats')}>
          <MessageSquare size={24} />
        </NavLink>
        <NavLink to="/contacts" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} title={t('navigation.contacts')}>
          <Users size={24} />
        </NavLink>
        <NavLink to="/calls" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} title={t('navigation.calls')}>
          <Phone size={24} />
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} title="Admin">
          <LayoutDashboard size={24} />
        </NavLink>
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} title={t('navigation.settings')}>
          <Settings size={24} />
        </NavLink>
        <NavLink to="/settings/edit-profile" className="avatar-placeholder">
          <img src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.displayName || user?.username || 'User'}&background=1F8A96&color=fff`} alt="Profile" />
        </NavLink>
      </div>
    </aside>
  );
};
