import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import { createRegistrationMaterial, setActiveIdentity } from '../../lib/crypto/accountKeys';
import { storeMasterKey, storeBlob } from '../../lib/crypto/keystore';

type Step = 1 | 2 | 3 | 4 | 5;

// Pending account material held in-memory between "account created" and the
// final step; we deliberately delay setAuth() until the user finishes the
// wizard so all five steps render on the (still unauthenticated) /register route.
interface Pending {
  user: any;
  token: string;
  identitySecret: Uint8Array;
  signingSecret: Uint8Array;
  mk: Uint8Array;
  encryptedPrivateKeys: string;
}

const Spinner = () => <span className="najva-spinner sm" />;

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M9 9h10v12H9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M5 12.5 L10 17.5 L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 4v11M7 11l5 5 5-5M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RegisterForm: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme } = useUIStore();
  const dark = theme === 'dark';
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>(1);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [creating, setCreating] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  const pending = useRef<Pending | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stepTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearTimeout(shakeTimer.current); clearTimeout(stepTimer.current); }, []);

  const fail = (msg: string) => {
    setError(msg);
    setShaking(true);
    shakeTimer.current = setTimeout(() => setShaking(false), 500);
  };

  const onNext1 = () => {
    const u = username.trim();
    if (u.length < 3) return fail(t('auth.reg.err_short'));
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return fail(t('auth.reg.err_chars'));
    setError('');
    setStep(2);
  };

  const onCreate = async () => {
    if (creating) return;
    if (password.length < 8) return fail(t('auth.reg.err_pass'));
    if (password !== password2) return fail(t('auth.reg.err_match'));
    setError('');
    setCreating(true);
    try {
      // All key material is generated + wrapped client-side; the server only
      // ever receives a derived loginKey and opaque wrapped blobs.
      const material = await createRegistrationMaterial({
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password,
      });
      const response = await api.post('/auth/register', material.payload);
      pending.current = {
        user: response.data.user,
        token: response.data.tokens.accessToken,
        identitySecret: material.identitySecret,
        signingSecret: material.signingSecret,
        mk: material.mk,
        encryptedPrivateKeys: material.payload.encryptedPrivateKeys,
      };
      setCodes(material.recoveryCodesDisplay);
      setCreating(false);
      setStep(3);
      // brief "account created" beat, then reveal the recovery keys
      stepTimer.current = setTimeout(() => setStep(4), 1800);
    } catch (err: any) {
      console.error('Registration error:', err);
      setCreating(false);
      fail(err.response?.data?.message || err.message || t('auth.register_error'));
    }
  };

  const onCopy = () => {
    try { navigator.clipboard.writeText(codes.join('\n')); } catch { /* clipboard may be blocked */ }
    setCopied(true);
  };

  const onDownload = () => {
    const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'najva-recovery-codes.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setDownloaded(true);
  };

  const onFinish = () => {
    if (!ack) return;
    setStep(5);
  };

  // Only now do we authenticate: identity secrets go into memory, the master
  // key is cached best-effort, and we enter the app.
  const enterApp = async () => {
    const p = pending.current;
    if (!p) return navigate('/login');
    setActiveIdentity(p.identitySecret, p.signingSecret);
    try {
      await storeMasterKey(p.user.id, p.mk);
      await storeBlob(p.user.id, 'encryptedPrivateKeys', p.encryptedPrivateKeys);
    } catch (cacheErr) {
      console.warn('Could not cache master key or private keys on this device:', cacheErr);
    }
    setAuth(p.user, p.token);
    navigate('/chat', { replace: true });
  };

  const dotStep = step <= 2 ? step : step === 3 ? 2 : 3;
  const dotInactive = dark ? '#2c4d53' : '#cfe1e3';
  const subtitle =
    step === 1 ? t('auth.reg.sub_1')
    : step === 2 ? t('auth.reg.sub_2')
    : step === 3 ? t('auth.reg.sub_3')
    : step === 4 ? t('auth.reg.sub_4')
    : t('auth.reg.sub_5');

  return (
    <div className={`najva-card najva-card-wide${shaking ? ' najva-shaking' : ''}`} data-screen-label="Registration card">
      <div className="najva-logo-wrap">
        <img src="/logo.webp" alt="Najva Messenger logo" className="najva-logo najva-logo-sm" />
      </div>
      <div className="najva-heading najva-heading-sm">
        <h1>{t('auth.reg.title')}</h1>
        <p>{subtitle}</p>
      </div>

      {step <= 4 && (
        <div className="najva-dots">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="najva-dot"
              style={{ width: i === dotStep ? 26 : 7, background: i <= dotStep ? 'var(--nj-teal)' : dotInactive }}
            />
          ))}
        </div>
      )}

      {/* STEP 1 — username */}
      {step === 1 && (
        <div className="najva-step najva-step-g18">
          <label className="najva-field">
            <span>{t('auth.reg.user_lbl')}</span>
            <input
              className="najva-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.reg.user_ph')}
              autoFocus
            />
            <span className="najva-hint">{t('auth.reg.user_hint')}</span>
          </label>

          <label className="najva-field">
            <span>{t('auth.reg.display_lbl')}</span>
            <input
              className="najva-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('auth.reg.display_ph')}
            />
          </label>

          {error && <div className="najva-error">{error}</div>}

          <div className="najva-btn-row">
            <Link to="/login" className="najva-btn-outline najva-flex1">{t('auth.reg.back')}</Link>
            <button type="button" className="najva-btn-primary najva-flex2" onClick={onNext1}>{t('auth.reg.next')}</button>
          </div>
        </div>
      )}

      {/* STEP 2 — password */}
      {step === 2 && (
        <div className="najva-step najva-step-g18">
          <label className="najva-field">
            <span>{t('auth.password')}</span>
            <input
              className="najva-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.reg.pass_ph')}
              autoFocus
            />
          </label>
          <label className="najva-field">
            <span>{t('auth.reg.pass2_lbl')}</span>
            <input
              className="najva-input"
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder={t('auth.reg.pass2_ph')}
            />
          </label>

          {error && <div className="najva-error">{error}</div>}

          <div className="najva-btn-row">
            <button type="button" className="najva-btn-outline najva-flex1" onClick={() => { setError(''); setStep(1); }}>
              {t('auth.reg.back')}
            </button>
            <button type="button" className={`najva-btn-primary najva-flex2${creating ? ' is-busy' : ''}`} onClick={onCreate} disabled={creating}>
              {creating ? <><Spinner />{t('auth.reg.creating')}</> : t('auth.reg.next')}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — account created */}
      {step === 3 && (
        <div className="najva-success najva-success-wizard">
          <div className="najva-success-badge">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5 L10 18.5 L20 6.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="najva-success-title lg">{t('auth.reg.created_title')}</div>
            <div className="najva-success-sub">{t('auth.reg.created_sub', { user: username.trim() })}</div>
          </div>
        </div>
      )}

      {/* STEP 4 — recovery keys */}
      {step === 4 && (
        <div className="najva-step">
          <div className="najva-keys-grid">
            {codes.map((code, i) => (
              <div className="najva-key" key={i}>
                <span className="n">{i + 1}</span>{code}
              </div>
            ))}
          </div>

          <div className="najva-btn-row">
            <button type="button" className={`najva-btn-outline najva-flex1${copied ? ' is-done' : ''}`} onClick={onCopy}>
              {copied ? <><CheckIcon />{t('auth.reg.copied')}</> : <><CopyIcon />{t('auth.reg.copy')}</>}
            </button>
            <button type="button" className={`najva-btn-outline najva-flex1${downloaded ? ' is-done' : ''}`} onClick={onDownload}>
              {downloaded ? <><CheckIcon />{t('auth.reg.saved')}</> : <><DownloadIcon />{t('auth.reg.download')}</>}
            </button>
          </div>

          <label className="najva-ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            {t('auth.reg.ack')}
          </label>

          <button
            type="button"
            className="najva-btn-primary"
            onClick={onFinish}
            disabled={!ack}
            style={{ opacity: ack ? 1 : 0.8, cursor: ack ? 'pointer' : 'not-allowed', background: ack ? undefined : (dark ? '#2c4d53' : '#b9d2d5') }}
          >
            {t('auth.reg.saved_continue')}
          </button>
        </div>
      )}

      {/* STEP 5 — all set */}
      {step === 5 && (
        <div className="najva-success najva-success-wizard">
          <div className="najva-success-badge amber">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 L14.5 9 L21 9.5 L16 13.7 L17.8 20 L12 16.5 L6.2 20 L8 13.7 L3 9.5 L9.5 9 Z" fill="#fff" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="najva-success-title lg">{t('auth.reg.done_title', { user: username.trim() })}</div>
            <div className="najva-success-sub">{t('auth.reg.done_sub')}</div>
          </div>
          <button type="button" className="najva-btn-cta" onClick={enterApp}>{t('auth.reg.enter')}</button>
        </div>
      )}
    </div>
  );
};

export default RegisterForm;
