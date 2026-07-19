import React from 'react';
import { Outlet } from 'react-router-dom';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  return (
    <div className="app-container">
      <Outlet />
    </div>
  );
};
