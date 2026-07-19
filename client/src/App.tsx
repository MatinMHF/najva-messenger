import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// Stores
import { useAuthStore } from './store/authStore';
import { loadMasterKey, loadBlob, storeBlob } from './lib/crypto/keystore';
import { unlockIdentityFromMk, setActiveIdentity } from './lib/crypto/accountKeys';
import { useUIStore } from './store/uiStore';
import { socketService } from './lib/socket';
import api from './lib/api';
// Layouts
import { MainLayout } from './components/layout/MainLayout';
// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatPage from './pages/ChatPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import EditProfilePage from './pages/EditProfilePage';
import SupportPage from './pages/SupportPage';
// New screens (Wave 0 stubs — filled by feature agents)
import UserProfilePage from './pages/UserProfilePage';
import UserMorePage from './pages/UserMorePage';
import MyProfilePage from './pages/MyProfilePage';
import TwoFactorPage from './pages/TwoFactorPage';
import RecoveryCodesPage from './pages/RecoveryCodesPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import { ResetApprovalListener } from './components/auth/ResetApprovalListener';
import { HistoryLostBanner } from './components/auth/HistoryLostBanner';
import CallOverlay from './components/call/CallOverlay';
import BatteryOptimizationNotice from './components/BatteryOptimizationNotice';
import { registerServiceWorker } from './lib/push';

function App() {
  const { i18n } = useTranslation();
  const { theme, language } = useUIStore();
  const { isAuthenticated, recoveryCodes } = useAuthStore();
  const [restoringKeys, setRestoringKeys] = useState(isAuthenticated);

  // After registration the client holds freshly-generated recovery codes that
  // must be explicitly acknowledged (RecoveryCodesPage clears them) before any
  // protected route is reachable.
  const mustAcknowledgeCodes = isAuthenticated && !!recoveryCodes && recoveryCodes.length > 0;

  useEffect(() => {
    if (!isAuthenticated) {
      setRestoringKeys(false);
      return;
    }
    const restoreKeys = async () => {
      try {
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          const mk = await loadMasterKey(userId);
          let encryptedPrivateKeys = await loadBlob(userId, 'encryptedPrivateKeys');
          if (mk && !encryptedPrivateKeys) {
            try {
              const res = await api.get('/auth/keys/master');
              if (res.data.encryptedPrivateKeys) {
                const serverKeys = res.data.encryptedPrivateKeys;
                encryptedPrivateKeys = serverKeys;
                await storeBlob(userId, 'encryptedPrivateKeys', serverKeys);
              }
            } catch (err) {
              console.warn('Failed to retrieve private keys blob on boot:', err);
            }
          }
          if (mk && encryptedPrivateKeys) {
            const identity = await unlockIdentityFromMk(mk, encryptedPrivateKeys);
            setActiveIdentity(identity.identitySecret, identity.signingSecret);
          }
        }
      } catch (err) {
        console.error('Failed to restore identity keys from IndexedDB cache:', err);
      } finally {
        setRestoringKeys(false);
      }
    };
    void restoreKeys();
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect();
      void registerServiceWorker();
    } else {
      socketService.disconnect();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Apply theme
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [theme]);

  useEffect(() => {
    // Apply language and direction
    i18n.changeLanguage(language);
    document.documentElement.setAttribute('lang', language);
    if (language === 'fa') {
      document.body.classList.add('fa-text');
    } else {
      document.body.classList.remove('fa-text');
    }
  }, [language, i18n]);

  if (restoringKeys) {
    return (
      <div style={{ display: 'flex', width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0b1d21' }}>
        <span className="najva-spinner" />
      </div>
    );
  }

  return (
    <>
      {isAuthenticated && <HistoryLostBanner />}
      {isAuthenticated && <BatteryOptimizationNotice />}
      {isAuthenticated && <ResetApprovalListener />}
      {isAuthenticated && <CallOverlay />}
      <Routes>
      {/* Public Routes */}
      <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/chat" />} />
      <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/chat" />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      {/* Recovery codes shown right after registration (needs auth from register response) */}
      <Route path="/recovery-codes" element={<RecoveryCodesPage />} />

      {/* Protected Routes */}
      <Route
        element={
          !isAuthenticated ? (
            <Navigate to="/login" />
          ) : mustAcknowledgeCodes ? (
            <Navigate to="/recovery-codes" />
          ) : (
            <MainLayout />
          )
        }
      >
        <Route path="/" element={<Navigate to="/chat" />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/edit-profile" element={<EditProfilePage />} />
        <Route path="/2fa" element={<TwoFactorPage />} />
        <Route path="/settings/2fa/recovery" element={<RecoveryCodesPage />} />
        <Route path="/settings/recovery-codes" element={<RecoveryCodesPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {/* User profile (peer) */}
        <Route path="/u/:userId" element={<UserProfilePage />} />
        <Route path="/u/:userId/more" element={<UserMorePage />} />
        {/* Current user profile */}
        <Route path="/me" element={<MyProfilePage />} />
        <Route path="/me/edit" element={<EditProfilePage />} />
      </Route>
      </Routes>
    </>
  );
}

export default App;
