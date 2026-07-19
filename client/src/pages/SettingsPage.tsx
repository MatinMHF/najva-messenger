import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { LanguageToggle } from '../components/common/LanguageToggle';
import { Lock, Shield, Key, Monitor, LogOut, KeyRound, Fingerprint, Plus } from 'lucide-react';
import './SettingsPage.css';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import {
  deriveLoginKey,
  unwrapMasterKey,
  rewrapMasterKey,
  generateRecoveryCodeShares,
} from '../lib/crypto/accountKeys';
import {
  passkeysSupported,
  listPasskeys,
  registerPasskey,
  renamePasskey,
  deletePasskey,
  type PasskeyInfo,
} from '../lib/webauthn';
import { loadMasterKey } from '../lib/crypto/keystore';

interface SessionRow {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

const formatWhen = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsError, setSessionsError] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Change-password flow
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // Recovery-code regeneration flow
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenTotp, setRegenTotp] = useState('');
  const [regenError, setRegenError] = useState('');
  const [regenBusy, setRegenBusy] = useState(false);

  // Passkeys (WebAuthn) — list + add/rename/delete
  const supportsPasskeys = passkeysSupported();
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(true);
  const [passkeysError, setPasskeysError] = useState('');

  // Add-passkey flow
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addError, setAddError] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addNotice, setAddNotice] = useState('');

  // Rename-passkey flow
  const [renameTarget, setRenameTarget] = useState<PasskeyInfo | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState('');

  // Delete-passkey flow (password-confirmed)
  const [deleteTarget, setDeleteTarget] = useState<PasskeyInfo | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const closePw = () => {
    setPwOpen(false);
    setPwCurrent('');
    setPwNew('');
    setPwConfirm('');
    setPwError('');
    setPwSuccess(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwNew !== pwConfirm) {
      setPwError(t('auth.passwords_mismatch', 'Passwords do not match.'));
      return;
    }
    if (pwNew.length < 6) {
      setPwError(t('forgot.passwordTooShort', 'Password must be at least 6 characters.'));
      return;
    }
    setPwBusy(true);
    try {
      // Re-derive the old KEK, unwrap the MK, re-wrap under the new password.
      const km = (await api.get('/auth/keys/master')).data;
      const derived = await deriveLoginKey(pwCurrent, km.kekSalt, km.kekIterations);
      let mk: Uint8Array;
      try {
        mk = await unwrapMasterKey(derived.kek, km.mkPasswordWrapped);
      } catch {
        setPwError(t('settings.wrongCurrentPassword', 'Your current password is incorrect.'));
        setPwBusy(false);
        return;
      }
      const rewrapped = await rewrapMasterKey(mk, pwNew);
      mk.fill(0);
      await api.post('/auth/password/change', {
        currentLoginKey: derived.loginKeyHex,
        newLoginKey: rewrapped.loginKey,
        newKekSalt: rewrapped.kekSalt,
        newKekIterations: rewrapped.kekIterations,
        newMkPasswordWrapped: rewrapped.mkPasswordWrapped,
      });
      setPwSuccess(true);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setPwError(t('settings.wrongCurrentPassword', 'Your current password is incorrect.'));
      } else {
        setPwError(t('errors.unknownError', 'An unknown error occurred.'));
      }
    } finally {
      setPwBusy(false);
    }
  };

  const closeRegen = () => {
    setRegenOpen(false);
    setRegenPassword('');
    setRegenTotp('');
    setRegenError('');
  };

  const handleRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegenError('');
    if (user?.totpEnabled && !regenTotp.trim()) {
      setRegenError(t('settings.totpRequired', 'Enter your authenticator code.'));
      return;
    }
    setRegenBusy(true);
    try {
      const km = (await api.get('/auth/keys/master')).data;
      const derived = await deriveLoginKey(regenPassword, km.kekSalt, km.kekIterations);
      let mk: Uint8Array;
      try {
        mk = await unwrapMasterKey(derived.kek, km.mkPasswordWrapped);
      } catch {
        setRegenError(t('settings.wrongCurrentPassword', 'Your current password is incorrect.'));
        setRegenBusy(false);
        return;
      }
      const { recoveryCodes, recoveryCodesDisplay } = await generateRecoveryCodeShares(mk);
      mk.fill(0);
      await api.post('/auth/recovery/reset', {
        loginKey: derived.loginKeyHex,
        totpCode: regenTotp.trim() || undefined,
        recoveryCodes,
      });
      // Show the fresh codes behind the existing acknowledgment gate.
      useAuthStore.getState().setRecoveryCodes(recoveryCodesDisplay);
      closeRegen();
      navigate('/settings/recovery-codes');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setRegenError(
          user?.totpEnabled
            ? t('settings.wrongPasswordOrTotp', 'Incorrect password or authenticator code.')
            : t('settings.wrongCurrentPassword', 'Your current password is incorrect.'),
        );
      } else {
        setRegenError(t('errors.unknownError', 'An unknown error occurred.'));
      }
    } finally {
      setRegenBusy(false);
    }
  };

  const loadPasskeys = useCallback(async () => {
    if (!supportsPasskeys) {
      setLoadingPasskeys(false);
      return;
    }
    setLoadingPasskeys(true);
    setPasskeysError('');
    try {
      setPasskeys(await listPasskeys());
    } catch {
      setPasskeysError(t('settings.passkeysLoadError', 'Could not load your passkeys.'));
    } finally {
      setLoadingPasskeys(false);
    }
  }, [t, supportsPasskeys]);

  const closeAdd = () => {
    setAddOpen(false);
    setAddName('');
    setAddError('');
    setAddNotice('');
  };

  const handleAddPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddBusy(true);
    try {
      // The passkey wraps this device's master key so it can later unlock/recover.
      const mk = user ? await loadMasterKey(user.id) : null;
      if (!mk) {
        setAddError(t('settings.passkeyNoKey', "Couldn't access your encryption key on this device. Sign in again with your password, then add a passkey."));
        setAddBusy(false);
        return;
      }
      let result;
      try {
        result = await registerPasskey(addName.trim() || t('settings.passkeyDefaultName', 'Passkey'), mk);
      } finally {
        mk.fill(0);
      }
      await loadPasskeys();
      setAddNotice(
        result.prfSupported
          ? t('settings.passkeyAdded', 'Passkey added. You can now sign in and recover with it.')
          : t('settings.passkeyAddedNoPrf', "Passkey added. This device's authenticator can't protect your keys, so this passkey signs you in but cannot recover your encrypted message history."),
      );
    } catch {
      setAddError(t('settings.passkeyAddFailed', 'Could not add a passkey. Please try again.'));
    } finally {
      setAddBusy(false);
    }
  };

  const openRename = (pk: PasskeyInfo) => {
    setRenameTarget(pk);
    setRenameName(pk.deviceName || '');
    setRenameError('');
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    setRenameError('');
    setRenameBusy(true);
    try {
      await renamePasskey(renameTarget.id, renameName.trim());
      await loadPasskeys();
      setRenameTarget(null);
    } catch {
      setRenameError(t('settings.passkeyRenameFailed', 'Could not rename the passkey.'));
    } finally {
      setRenameBusy(false);
    }
  };

  const openDelete = (pk: PasskeyInfo) => {
    setDeleteTarget(pk);
    setDeletePassword('');
    setDeleteError('');
  };

  const handleDeletePasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleteError('');
    setDeleteBusy(true);
    try {
      const km = (await api.get('/auth/keys/master')).data;
      const derived = await deriveLoginKey(deletePassword, km.kekSalt, km.kekIterations);
      await deletePasskey(deleteTarget.id, derived.loginKeyHex);
      await loadPasskeys();
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(
        err.response?.status === 401 || err.response?.status === 403
          ? t('settings.wrongCurrentPassword', 'Your current password is incorrect.')
          : t('settings.passkeyDeleteFailed', 'Could not remove the passkey. Please try again.'),
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setSessionsError('');
    try {
      const res = await api.get('/auth/sessions');
      setSessions(res.data.sessions ?? []);
    } catch {
      setSessionsError(t('sessions.loadError', 'Could not load your sessions.'));
    } finally {
      setLoadingSessions(false);
    }
  }, [t]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  const handleRevoke = async (session: SessionRow) => {
    setRevoking(session.id);
    try {
      await api.delete(`/auth/sessions/${session.id}`);
      if (session.current) {
        // Revoked our own session: the refresh token is dead — log out.
        useAuthStore.getState().logout();
        navigate('/login');
        return;
      }
      await loadSessions();
    } catch {
      setSessionsError(t('sessions.revokeError', 'Could not revoke that session.'));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>{t('navigation.settings')}</h1>
      </header>

      <div className="settings-content">
        <section className="settings-section">
          <h2>{t('navigation.profile')}</h2>
          <div className="profile-card glass-panel">
            <div
              className="profile-card-main"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/me')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/me'); } }}
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, cursor: 'pointer', minWidth: 0 }}
              aria-label={t('profile.myProfile', 'My Profile')}
            >
              <img src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.displayName || user?.username}&background=1F8A96&color=fff`} alt="Profile" className="profile-img" />
              <div className="profile-info">
                <h3>{user?.displayName || user?.username}</h3>
                <p>@{user?.username}</p>
                {user?.bio && <p style={{ marginTop: '8px', fontSize: '0.9em', opacity: 0.8 }}>{user.bio}</p>}
              </div>
            </div>
            <button className="btn-edit" onClick={() => navigate('/settings/edit-profile')}>{t('common.edit')}</button>
          </div>
        </section>

        <section className="settings-section">
          <h2>{t('settings.theme')} & {t('settings.language')}</h2>
          <div className="settings-list glass-panel">
            <div className="setting-item">
              <div className="setting-label">
                <div className="setting-icon"><ThemeToggle /></div>
                <span>{t('settings.theme')}</span>
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-label">
                <div className="setting-icon"><LanguageToggle /></div>
                <span>{t('settings.language')}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>{t('settings.privacy')}</h2>
          <div className="settings-list glass-panel">
            <div className="setting-item">
              <div className="setting-label">
                <KeyRound size={20} className="setting-icon" />
                <span>{t('settings.changePassword', 'Change Password')}</span>
              </div>
              <button className="btn-outline" onClick={() => setPwOpen(true)}>{t('common.edit')}</button>
            </div>
            <div className="setting-item">
              <Link to="/2fa" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="setting-label">
                  <Lock size={20} className="setting-icon" />
                  <span>{t('settings.twoFactor')}</span>
                </div>
                <button className="btn-outline">{t('common.edit')}</button>
              </Link>
            </div>
            <div className="setting-item">
              <div className="setting-label">
                <Key size={20} className="setting-icon" />
                <span>{t('recovery.title')}</span>
              </div>
              <button className="btn-outline" onClick={() => { setRegenOpen(true); }}>
                {t('settings.regenerate', 'Regenerate')}
              </button>
            </div>
            <div className="setting-item">
              <div className="setting-label">
                <Shield size={20} className="setting-icon" />
                <span>{t('settings.blockedUsers')}</span>
              </div>
              <span className="badge">12</span>
            </div>
          </div>
        </section>

        {supportsPasskeys && (
          <section className="settings-section">
            <h2>{t('settings.passkeys', 'Passkeys')}</h2>
            <p className="settings-section-desc" style={{ opacity: 0.75, fontSize: '0.85em', margin: '0 0 12px' }}>
              {t('settings.passkeysDesc', "Sign in without a password using your device's biometrics or a security key. A recovery-ready passkey can also restore access to your encrypted messages.")}
            </p>
            <div className="settings-list glass-panel">
              {loadingPasskeys && <div className="setting-item"><span>{t('common.loading')}</span></div>}
              {passkeysError && <div className="setting-item"><span style={{ color: 'var(--error-color)' }}>{passkeysError}</span></div>}
              {!loadingPasskeys && !passkeysError && passkeys.length === 0 && (
                <div className="setting-item"><span style={{ opacity: 0.7 }}>{t('settings.noPasskeys', 'No passkeys yet.')}</span></div>
              )}
              {passkeys.map((pk) => (
                <div className="setting-item" key={pk.id}>
                  <div className="setting-label">
                    <Fingerprint size={20} className="setting-icon" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>
                        {pk.deviceName || t('settings.passkeyDefaultName', 'Passkey')}
                        <span
                          className="badge"
                          style={{ marginInlineStart: 8 }}
                          title={pk.prfSupported
                            ? t('settings.passkeyRecoveryReadyHint', 'Can restore access to your encrypted message history.')
                            : t('settings.passkeySignInOnlyHint', 'Signs you in, but cannot recover your message history.')}
                        >
                          {pk.prfSupported
                            ? t('settings.passkeyRecoveryReady', 'Recovery-ready')
                            : t('settings.passkeySignInOnly', 'Sign-in only')}
                        </span>
                      </span>
                      <span style={{ fontSize: '0.75em', opacity: 0.7 }}>
                        {[
                          `${t('settings.passkeyAdded_label', 'Added')} ${formatWhen(pk.createdAt)}`,
                          pk.lastUsedAt ? `${t('settings.passkeyLastUsed', 'Last used')} ${formatWhen(pk.lastUsedAt)}` : '',
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-outline" onClick={() => openRename(pk)}>{t('common.edit')}</button>
                    <button className="btn-outline" onClick={() => openDelete(pk)}>{t('settings.passkeyRemove', 'Remove')}</button>
                  </div>
                </div>
              ))}
              <div className="setting-item">
                <button
                  className="btn-primary"
                  onClick={() => { setAddName(''); setAddError(''); setAddNotice(''); setAddOpen(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={16} />
                  {t('settings.addPasskey', 'Add passkey')}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="settings-section">
          <h2>{t('sessions.title', 'Active Sessions')}</h2>
          <p className="settings-section-desc" style={{ opacity: 0.75, fontSize: '0.85em', margin: '0 0 12px' }}>
            {t('sessions.description', 'Devices currently signed in to your account. Revoke any you don’t recognize.')}
          </p>
          <div className="settings-list glass-panel">
            {loadingSessions && <div className="setting-item"><span>{t('common.loading')}</span></div>}
            {sessionsError && <div className="setting-item"><span style={{ color: 'var(--error-color)' }}>{sessionsError}</span></div>}
            {!loadingSessions && !sessionsError && sessions.length === 0 && (
              <div className="setting-item"><span>{t('sessions.empty', 'No active sessions found.')}</span></div>
            )}
            {sessions.map((s) => (
              <div className="setting-item" key={s.id}>
                <div className="setting-label">
                  <Monitor size={20} className="setting-icon" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span>
                      {s.deviceName || s.userAgent || t('sessions.unknownDevice', 'Unknown device')}
                      {s.current && (
                        <span className="badge" style={{ marginInlineStart: 8 }}>{t('sessions.current', 'This device')}</span>
                      )}
                    </span>
                    <span style={{ fontSize: '0.75em', opacity: 0.7 }}>
                      {[s.ip, formatWhen(s.lastUsedAt || s.createdAt)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>
                <button
                  className="btn-outline"
                  disabled={revoking === s.id}
                  onClick={() => handleRevoke(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <LogOut size={16} />
                  {revoking === s.id ? t('common.loading') : t('sessions.revoke', 'Revoke')}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {pwOpen && (
        <div className="settings-modal-overlay" onClick={closePw}>
          <div className="settings-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('settings.changePassword', 'Change Password')}</h2>
            {pwSuccess ? (
              <>
                <p style={{ opacity: 0.8, marginBottom: 16 }}>
                  {t('settings.passwordChanged', 'Your password was changed. Other sessions have been signed out.')}
                </p>
                <button className="btn-primary" onClick={closePw}>{t('common.close')}</button>
              </>
            ) : (
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ opacity: 0.75, fontSize: '0.85em', margin: 0 }}>
                  {t('settings.changePasswordDesc', 'Re-enter your current password to re-encrypt your keys under a new one.')}
                </p>
                {pwError && <div style={{ color: 'var(--error-color)', fontSize: '0.85em' }}>{pwError}</div>}
                <input type="password" autoComplete="current-password" placeholder={t('settings.currentPassword', 'Current password')}
                  value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
                <input type="password" autoComplete="new-password" placeholder={t('settings.newPassword', 'New password')}
                  value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
                <input type="password" autoComplete="new-password" placeholder={t('auth.confirm_password', 'Confirm password')}
                  value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-outline" onClick={closePw}>{t('common.cancel')}</button>
                  <button type="submit" className="btn-primary" disabled={pwBusy}>
                    {pwBusy ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {regenOpen && (
        <div className="settings-modal-overlay" onClick={closeRegen}>
          <div className="settings-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('settings.regenerateCodes', 'Regenerate Recovery Codes')}</h2>
            <form onSubmit={handleRegenerate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ opacity: 0.75, fontSize: '0.85em', margin: 0 }}>
                {t('settings.regenerateDesc', 'This invalidates all of your existing recovery codes and issues a new set.')}
              </p>
              {regenError && <div style={{ color: 'var(--error-color)', fontSize: '0.85em' }}>{regenError}</div>}
              <input type="password" autoComplete="current-password" placeholder={t('settings.currentPassword', 'Current password')}
                value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} required />
              {user?.totpEnabled && (
                <input type="text" inputMode="numeric" placeholder={t('settings.authenticatorCode', 'Authenticator code')}
                  value={regenTotp} onChange={(e) => setRegenTotp(e.target.value)} />
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-outline" onClick={closeRegen}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" disabled={regenBusy}>
                  {regenBusy ? t('common.loading') : t('settings.regenerate', 'Regenerate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="settings-modal-overlay" onClick={closeAdd}>
          <div className="settings-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('settings.addPasskey', 'Add passkey')}</h2>
            {addNotice ? (
              <>
                <p style={{ opacity: 0.85, marginBottom: 16 }}>{addNotice}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" onClick={closeAdd}>{t('common.close')}</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleAddPasskey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ opacity: 0.75, fontSize: '0.85em', margin: 0 }}>
                  {t('settings.addPasskeyDesc', "Give this passkey a name, then follow your device's prompt to create it.")}
                </p>
                {addError && <div style={{ color: 'var(--error-color)', fontSize: '0.85em' }}>{addError}</div>}
                <input type="text" placeholder={t('settings.passkeyName', 'Passkey name')} maxLength={64}
                  value={addName} onChange={(e) => setAddName(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-outline" onClick={closeAdd}>{t('common.cancel')}</button>
                  <button type="submit" className="btn-primary" disabled={addBusy}>
                    {addBusy ? t('common.loading') : t('settings.addPasskey', 'Add passkey')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="settings-modal-overlay" onClick={() => setRenameTarget(null)}>
          <div className="settings-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('settings.renamePasskey', 'Rename passkey')}</h2>
            <form onSubmit={handleRename} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {renameError && <div style={{ color: 'var(--error-color)', fontSize: '0.85em' }}>{renameError}</div>}
              <input type="text" placeholder={t('settings.passkeyName', 'Passkey name')} maxLength={64}
                value={renameName} onChange={(e) => setRenameName(e.target.value)} required />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-outline" onClick={() => setRenameTarget(null)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" disabled={renameBusy}>
                  {renameBusy ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="settings-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="settings-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('settings.passkeyRemove', 'Remove')} — {deleteTarget.deviceName || t('settings.passkeyDefaultName', 'Passkey')}</h2>
            <form onSubmit={handleDeletePasskey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ opacity: 0.75, fontSize: '0.85em', margin: 0 }}>
                {t('settings.deletePasskeyDesc', "Enter your password to remove this passkey. You won't be able to sign in or recover with it anymore.")}
              </p>
              {deleteError && <div style={{ color: 'var(--error-color)', fontSize: '0.85em' }}>{deleteError}</div>}
              <input type="password" autoComplete="current-password" placeholder={t('settings.currentPassword', 'Current password')}
                value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" disabled={deleteBusy}>
                  {deleteBusy ? t('common.loading') : t('settings.passkeyRemove', 'Remove')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
