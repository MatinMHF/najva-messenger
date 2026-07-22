import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import {
  deriveLoginKey,
  unlockAccount,
  unlockIdentityFromMk,
  setActiveIdentity,
} from '../../lib/crypto/accountKeys';
import { storeMasterKey, loadMasterKey, storeBlob } from '../../lib/crypto/keystore';
import { passkeysSupported, loginWithPasskey, unlockMkWithPasskey } from '../../lib/webauthn';

type Phase = 'idle' | 'signing' | 'passkey' | 'success';

const PasskeyIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display: 'inline-flex' }}>
    <circle cx="9" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.35 3.2.95" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="17.5" cy="13.5" r="2.5" stroke="currentColor" strokeWidth="2" />
    <path d="M17.5 16v5l1.5-1.5M17.5 21 16 19.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LoginForm: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [successKind, setSuccessKind] = useState<'signin' | 'passkey'>('signin');
  const [shaking, setShaking] = useState(false);

  const isWebCryptoAvailable = !!globalThis.crypto?.subtle;

  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearTimeout(shakeTimer.current); clearTimeout(navTimer.current); }, []);

  const busy = phase === 'signing' || phase === 'passkey';

  const fail = (msg: string) => {
    setError(msg);
    setPhase('idle');
    setShaking(true);
    shakeTimer.current = setTimeout(() => setShaking(false), 500);
  };

  const succeed = (kind: 'signin' | 'passkey') => {
    setSuccessKind(kind);
    setPhase('success');
    navTimer.current = setTimeout(() => navigate('/chat'), 1200);
  };

  const handlePasskeyLogin = async () => {
    if (busy) return;
    setError('');
    setPhase('passkey');
    try {
      const result = await loginWithPasskey();

      let mk: Uint8Array | null = null;
      if (result.prfSupported) {
        mk = await unlockMkWithPasskey(result.credentialId, result.prfSalt, result.wrappedMk);
      }
      if (!mk) {
        mk = await loadMasterKey(result.user.id);
      }

      if (!mk || !result.encryptedPrivateKeys) {
        fail(t('auth.passkeyNeedsPassword'));
        return;
      }

      const identity = await unlockIdentityFromMk(mk, result.encryptedPrivateKeys);
      setAuth({ ...result.user, displayName: result.user.displayName ?? result.user.username }, result.token);
      setActiveIdentity(identity.identitySecret, identity.signingSecret);
      try {
        await storeMasterKey(result.user.id, mk);
        await storeBlob(result.user.id, 'encryptedPrivateKeys', result.encryptedPrivateKeys);
      } catch (cacheErr) {
        console.warn('Could not cache master key or private keys on this device:', cacheErr);
      }
      succeed('passkey');
    } catch (err: any) {
      const name = err?.name;
      if (name === 'NotAllowedError' || name === 'AbortError') {
        setPhase('idle');
        return;
      }
      fail(t('auth.passkeyLoginFailed'));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      fail(t('auth.fill_fields'));
      return;
    }

    if (!isWebCryptoAvailable) {
      fail('مرورگر شما دسترسی WebCrypto را در اتصال HTTP غیرفعال کرده است. لطفاً از دامنه با HTTPS یا http://localhost استفاده کنید.');
      return;
    }

    setError('');
    setPhase('signing');

    try {
      const params = await api.get('/auth/params', { params: { username } });
      const { loginKeyHex, kek } = await deriveLoginKey(
        password,
        params.data.kekSalt,
        params.data.kekIterations,
      );

      const response = await api.post('/auth/login', { username, loginKey: loginKeyHex, totpCode });
      if (response.data.requires2FA) {
        setRequires2FA(true);
        setPhase('idle');
        return;
      }

      const { user, tokens, mkPasswordWrapped, encryptedPrivateKeys } = response.data;

      const unlocked = await unlockAccount({ kek, mkPasswordWrapped, encryptedPrivateKeys });
      setAuth(user, tokens.accessToken);
      setActiveIdentity(unlocked.identitySecret, unlocked.signingSecret);
      try {
        await storeMasterKey(user.id, unlocked.mk);
        await storeBlob(user.id, 'encryptedPrivateKeys', encryptedPrivateKeys);
      } catch (cacheErr) {
        console.warn('Could not cache master key or private keys on this device:', cacheErr);
      }

      succeed('signin');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      fail(
        msg === 'Invalid credentials' || msg === 'Invalid username or password'
          ? t('auth.login_error')
          : msg || t('auth.login_error'),
      );
    }
  };

  if (phase === 'success') {
    return (
      <div className="najva-card" data-screen-label="Login card">
        <div className="najva-logo-wrap">
          <img src="/logo.webp" alt="Najva Messenger logo" className="najva-logo" />
        </div>
        <div className="najva-success">
          <div className="najva-success-badge">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5 L10 18.5 L20 6.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="najva-success-title">
              {successKind === 'passkey' ? t('auth.passkey_verified') : t('auth.signed_in')}
            </div>
            <div className="najva-success-sub">{t('auth.taking_to_chats')}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`najva-card${shaking ? ' najva-shaking' : ''}`} data-screen-label="Login card">
      <div className="najva-logo-wrap">
        <img src="/logo.webp" alt="Najva Messenger logo" className="najva-logo" />
      </div>

      <div className="najva-heading">
        <h1>{t('auth.login_title')}</h1>
        <p>{t('auth.login_subtitle')}</p>
      </div>

      {!isWebCryptoAvailable && (
        <div className="najva-error" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171', marginBottom: '16px' }}>
          ⚠️ برای رمزنگاری امن E2EE، مرورگر نیاز به اتصال HTTPS یا localhost دارد. روی HTTP معمولی با IP، رمزنگاری WebCrypto مرورگر غیرفعال است.
        </div>
      )}

      <form onSubmit={handleLogin} className="najva-form">
        <label className="najva-field">
          <span>{t('auth.email_or_username')}</span>
          <input
            className="najva-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth.email_placeholder')}
            disabled={busy}
          />
        </label>

        <label className="najva-field">
          <span>{t('auth.password')}</span>
          <input
            className="najva-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={busy}
          />
        </label>

        <div className="najva-form-row">
          <label className="najva-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t('auth.remember')}
          </label>
          <Link to="/forgot-password" state={{ username }} className="najva-link-strong">{t('auth.forgot')}</Link>
        </div>

        {requires2FA && (
          <label className="najva-field">
            <span>{t('auth.twofa_code')}</span>
            <input
              className="najva-input"
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder={t('auth.twofa_placeholder')}
              pattern="\d{6}"
              maxLength={6}
              inputMode="numeric"
              disabled={busy}
              required
            />
          </label>
        )}

        {error && <div className="najva-error">{error}</div>}

        <button type="submit" className={`najva-btn-primary${phase === 'signing' ? ' is-busy' : ''}`} disabled={busy}>
          {phase === 'signing' ? (
            <><span className="najva-spinner" />{t('auth.signing_in')}</>
          ) : requires2FA ? (
            t('auth.verify_twofa')
          ) : (
            t('auth.login_button')
          )}
        </button>

        {passkeysSupported() && (
          <>
            <div className="najva-divider">
              <span className="line" />
              <span>{t('auth.or')}</span>
              <span className="line" />
            </div>

            <button type="button" className="najva-btn-passkey" onClick={handlePasskeyLogin} disabled={busy}>
              {phase === 'passkey' ? (
                <><span className="najva-spinner teal" />{t('auth.passkey_waiting')}</>
              ) : (
                <><PasskeyIcon />{t('auth.passkeyLogin')}</>
              )}
            </button>
          </>
        )}

        <p className="najva-footer">
          {t('auth.new_to_najva')} <Link to="/register">{t('auth.sign_up_link')}</Link>
        </p>
      </form>
    </div>
  );
};

export default LoginForm;
