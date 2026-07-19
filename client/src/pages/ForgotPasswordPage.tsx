import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AuthShell from '../components/auth/AuthShell';
import api from '../lib/api';
import {
  recoveryVerifierFromInput,
  unwrapMkWithRecoveryCode,
  unwrapMkWithPrf,
  rewrapMasterKey,
} from '../lib/crypto/accountKeys';
import { recoverWithPasskey, evaluatePrf } from '../lib/webauthn';
import { generateDHKeyPair } from '../lib/crypto/primitives';
import { openEnvelope } from '../lib/crypto/envelope';
import { arrayBufferToBase64 } from '../lib/crypto/utils';

type Step = 'menu' | 'username' | 'code' | 'rkey' | 'passkey' | 'reset' | 'done';
type Via = 'device' | 'rkey' | 'passkey';

const Spinner = () => <span className="najva-spinner sm" />;

const DeviceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const KeyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="8" cy="14" r="4.5" stroke="currentColor" strokeWidth="2" />
    <path d="M11.5 10.5 L20 2.5M16 6.5l2.5 2.5M13.5 9l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const PasskeyGlyph = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.35 3.2.95" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="17.5" cy="13.5" r="2.5" stroke="currentColor" strokeWidth="2" />
    <path d="M17.5 16v5l1.5-1.5M17.5 21 16 19.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Recovery-key and other-device both need the account username first; we
  // prefill it from the login page when available, but always ask on those
  // paths. Passkey recovery is username-less (discoverable credential).
  const [username, setUsername] = useState(((location.state as any)?.username || '').trim());
  const [pendingMethod, setPendingMethod] = useState<'rkey' | 'device'>('rkey');

  const [step, setStep] = useState<Step>('menu');
  const [via, setVia] = useState<Via>('rkey');
  const [code, setCode] = useState('');
  const [rkey, setRkey] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [busyKind, setBusyKind] = useState<null | 'code' | 'rkey' | 'reset' | 'passkey'>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  // Held key material between "verify" and "set new password".
  const held = useRef<{ mk: Uint8Array | null; recoveryToken: string | null }>({ mk: null, recoveryToken: null });
  // Other-device (flow C) handshake state.
  const flowC = useRef<{ resetId: string; resetSecret: string; ephemeralSecret: Uint8Array; sealedMk: string | null }>({
    resetId: '', resetSecret: '', ephemeralSecret: new Uint8Array(), sealedMk: null,
  });
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearInterval(timer.current); clearTimeout(shakeTimer.current); }, []);

  const busy = busyKind !== null;

  const fail = (msg: string) => {
    setError(msg);
    setBusyKind(null);
    setShaking(true);
    shakeTimer.current = setTimeout(() => setShaking(false), 500);
  };

  const startTimer = () => {
    clearInterval(timer.current);
    setSecondsLeft(60);
    timer.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(timer.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const goReset = (v: Via) => { setVia(v); setError(''); setBusyKind(null); setStep('reset'); };

  // ---- menu picks ----
  // Recovery-key and other-device first collect the username, then continue.
  const goUsername = (method: 'rkey' | 'device') => { setPendingMethod(method); setError(''); setStep('username'); };

  const onUsernameContinue = () => {
    if (!username.trim()) return fail(t('auth.rec.err_username'));
    setError('');
    if (pendingMethod === 'rkey') { setRkey(''); setStep('rkey'); }
    else void startDeviceFlow();
  };

  const startDeviceFlow = async () => {
    setError('');
    try {
      const eph = generateDHKeyPair();
      const ephemeralPub = arrayBufferToBase64(eph.publicKey);
      const { data } = await api.post('/auth/reset/request', { username: username.trim(), ephemeralPub });
      flowC.current = { resetId: data.resetId, resetSecret: data.resetSecret, ephemeralSecret: eph.secretKey, sealedMk: null };
      setApproved(false);
      setCode('');
      startTimer();
      setStep('code');
    } catch (err: any) {
      fail(err.response?.data?.message || t('auth.rec.err_generic'));
    }
  };

  const pickPasskey = async () => {
    setError('');
    setStep('passkey');
    setBusyKind('passkey');
    try {
      const rec = await recoverWithPasskey();
      const prfOut = await evaluatePrf(rec.credentialId, rec.prfSalt);
      if (!prfOut) return fail(t('auth.rec.err_passkey'));
      let mk: Uint8Array;
      try { mk = await unwrapMkWithPrf(prfOut, rec.prfSalt, rec.wrappedMk); }
      catch { prfOut.fill(0); return fail(t('auth.rec.err_passkey')); }
      prfOut.fill(0);
      held.current = { mk, recoveryToken: rec.recoveryToken };
      goReset('passkey');
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') { setBusyKind(null); setStep('menu'); return; }
      fail(t('auth.rec.err_passkey'));
    }
  };

  // Background poll for device-A approval (flow C).
  useEffect(() => {
    if (step !== 'code') return;
    let active = true;
    const poll = async () => {
      try {
        const { data } = await api.get(
          `/auth/reset/status/${flowC.current.resetId}?secret=${encodeURIComponent(flowC.current.resetSecret)}`,
        );
        if (!active) return;
        if (data.status === 'APPROVED' && data.sealedMk) {
          flowC.current.sealedMk = data.sealedMk;
          setApproved(true);
        }
      } catch { /* keep polling until the request expires */ }
    };
    const id = setInterval(poll, 3000);
    poll();
    return () => { active = false; clearInterval(id); };
  }, [step]);

  // ---- step confirms ----
  const onConfirmCode = () => {
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) return fail(t('auth.rec.err_code'));
    if (!approved || !flowC.current.sealedMk) return fail(t('auth.rec.err_approve'));
    goReset('device');
  };

  const onConfirmRkey = () => {
    if (busy) return;
    if (!rkey.trim()) return fail(t('auth.rec.err_rkey'));
    goReset('rkey');
  };

  const onResend = () => {
    if (secondsLeft !== 0) return;
    void startDeviceFlow();
  };

  const onConfirmReset = async () => {
    if (busy) return;
    if (newPass.length < 8) return fail(t('auth.rec.err_pass'));
    if (newPass !== newPass2) return fail(t('auth.rec.err_match'));
    setError('');
    setBusyKind('reset');
    try {
      if (via === 'rkey') {
        const typed = rkey.trim();
        let verifierHash: string;
        try { verifierHash = await recoveryVerifierFromInput(typed); }
        catch { return fail(t('auth.rec.err_rkey')); }
        const verifyRes = await api.post('/auth/recover/verify', { username: username.trim(), verifierHash });
        const { wrappedMk, wrapSalt, recoveryToken } = verifyRes.data;
        let mk: Uint8Array;
        try { mk = await unwrapMkWithRecoveryCode(typed, wrappedMk, wrapSalt); }
        catch { return fail(t('auth.rec.err_rkey')); }
        const rewrapped = await rewrapMasterKey(mk, newPass);
        mk.fill(0);
        await api.post('/auth/recover/complete', {
          recoveryToken,
          newLoginKey: rewrapped.loginKey,
          kekSalt: rewrapped.kekSalt,
          kekIterations: rewrapped.kekIterations,
          mkPasswordWrapped: rewrapped.mkPasswordWrapped,
        });
      } else if (via === 'passkey') {
        const mk = held.current.mk!;
        const rewrapped = await rewrapMasterKey(mk, newPass);
        mk.fill(0);
        await api.post('/auth/recover/complete', {
          recoveryToken: held.current.recoveryToken,
          newLoginKey: rewrapped.loginKey,
          kekSalt: rewrapped.kekSalt,
          kekIterations: rewrapped.kekIterations,
          mkPasswordWrapped: rewrapped.mkPasswordWrapped,
        });
      } else {
        // other device
        let mk: Uint8Array;
        try { mk = openEnvelope(flowC.current.ephemeralSecret, flowC.current.sealedMk!); }
        catch { return fail(t('auth.rec.err_approve')); }
        const rewrapped = await rewrapMasterKey(mk, newPass);
        mk.fill(0);
        await api.post('/auth/reset/complete', {
          resetId: flowC.current.resetId,
          resetSecret: flowC.current.resetSecret,
          otp: code.trim(),
          newLoginKey: rewrapped.loginKey,
          kekSalt: rewrapped.kekSalt,
          kekIterations: rewrapped.kekIterations,
          mkPasswordWrapped: rewrapped.mkPasswordWrapped,
        });
        flowC.current.ephemeralSecret.fill(0);
      }
      setBusyKind(null);
      setStep('done');
    } catch (err: any) {
      fail(err.response?.data?.message || t('auth.rec.err_invalid'));
    }
  };

  const backToMenu = () => { clearInterval(timer.current); setError(''); setBusyKind(null); setStep('menu'); };

  const heading = t(`auth.rec.${step}_title`);
  const subheading = t(`auth.rec.${step}_sub`);
  const mm = String(Math.floor(secondsLeft / 60));
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const canResend = secondsLeft === 0;
  const viaLabel = via === 'device' ? t('auth.rec.via_device') : via === 'passkey' ? t('auth.rec.via_passkey') : t('auth.rec.via_rkey');

  return (
    <AuthShell>
      <div className={`najva-card najva-card-wide${shaking ? ' najva-shaking' : ''}`} data-screen-label="Account recovery card">
        <div className="najva-logo-wrap">
          <img src="/logo.webp" alt="Najva Messenger logo" className="najva-logo najva-logo-sm" />
        </div>
        <div className="najva-heading najva-heading-sm">
          <h1>{heading}</h1>
          <p>{subheading}</p>
        </div>

        {/* MENU */}
        {step === 'menu' && (
          <div className="najva-step" style={{ gap: 12 }}>
            <button type="button" className="najva-option" onClick={() => goUsername('device')}>
              <div className="najva-option-icon teal"><DeviceIcon /></div>
              <div className="najva-option-text">
                <span className="najva-option-title">{t('auth.rec.opt_device')}</span>
                <span className="najva-option-sub">{t('auth.rec.opt_device_sub')}</span>
              </div>
            </button>
            <button type="button" className="najva-option" onClick={() => goUsername('rkey')}>
              <div className="najva-option-icon amber"><KeyIcon /></div>
              <div className="najva-option-text">
                <span className="najva-option-title">{t('auth.rec.opt_rkey')}</span>
                <span className="najva-option-sub">{t('auth.rec.opt_rkey_sub')}</span>
              </div>
            </button>
            <button type="button" className="najva-option" onClick={pickPasskey}>
              <div className="najva-option-icon teal"><PasskeyGlyph /></div>
              <div className="najva-option-text">
                <span className="najva-option-title">{t('auth.rec.opt_passkey')}</span>
                <span className="najva-option-sub">{t('auth.rec.opt_passkey_sub')}</span>
              </div>
            </button>
            <Link to="/login" style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 700, marginTop: 8 }}>
              {t('auth.rec.back_signin')}
            </Link>
          </div>
        )}

        {/* USERNAME (recovery key / other device) */}
        {step === 'username' && (
          <div className="najva-step">
            <label className="najva-field">
              <span>{t('auth.rec.username_lbl')}</span>
              <input
                className="najva-input"
                type="text"
                placeholder={t('auth.rec.username_ph')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onUsernameContinue(); }}
                autoFocus
              />
            </label>
            {error && <div className="najva-error">{error}</div>}
            <div className="najva-btn-row">
              <button type="button" className="najva-btn-outline najva-flex1" onClick={backToMenu}>{t('auth.rec.back')}</button>
              <button type="button" className="najva-btn-primary najva-flex2" onClick={onUsernameContinue}>{t('auth.rec.continue')}</button>
            </div>
          </div>
        )}

        {/* CODE (other device) */}
        {step === 'code' && (
          <div className="najva-step">
            <div className="najva-note">{t('auth.rec.code_note')}</div>
            <input
              className="najva-code-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
            <div className="najva-timer-row">
              <span className="najva-timer">{canResend ? t('auth.rec.code_expired') : t('auth.rec.code_expires', { time: `${mm}:${ss}` })}</span>
              <button
                type="button"
                className="najva-resend"
                onClick={onResend}
                disabled={!canResend}
                style={{ color: canResend ? 'var(--nj-amber-ink)' : 'var(--nj-muted)', cursor: canResend ? 'pointer' : 'default' }}
              >
                {t('auth.rec.resend')}
              </button>
            </div>
            {error && <div className="najva-error">{error}</div>}
            <div className="najva-btn-row">
              <button type="button" className="najva-btn-outline najva-flex1" onClick={backToMenu}>{t('auth.rec.back')}</button>
              <button type="button" className="najva-btn-primary najva-flex2" onClick={onConfirmCode}>{t('auth.rec.confirm_code')}</button>
            </div>
          </div>
        )}

        {/* RKEY */}
        {step === 'rkey' && (
          <div className="najva-step">
            <label className="najva-field">
              <span>{t('auth.rec.rkey_lbl')}</span>
              <input
                className="najva-rkey-input"
                type="text"
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX"
                value={rkey}
                onChange={(e) => setRkey(e.target.value)}
                autoFocus
              />
              <span className="najva-hint">{t('auth.rec.rkey_hint')}</span>
            </label>
            {error && <div className="najva-error">{error}</div>}
            <div className="najva-btn-row">
              <button type="button" className="najva-btn-outline najva-flex1" onClick={backToMenu}>{t('auth.rec.back')}</button>
              <button type="button" className="najva-btn-primary najva-flex2" onClick={onConfirmRkey}>{t('auth.rec.validate_key')}</button>
            </div>
          </div>
        )}

        {/* PASSKEY */}
        {step === 'passkey' && (
          <div className="najva-step" style={{ alignItems: 'center', marginTop: 30, marginBottom: 10 }}>
            <div className="najva-pk-ring"><PasskeyGlyph size={38} /></div>
            <div style={{ textAlign: 'center' }}>
              <div className="najva-success-title">{t('auth.rec.pk_wait')}</div>
              <div className="najva-success-sub">{t('auth.rec.pk_sub')}</div>
            </div>
            {error && <div className="najva-error" style={{ width: '100%' }}>{error}</div>}
            <button type="button" className="najva-btn-outline" style={{ marginTop: 4 }} onClick={backToMenu}>{t('auth.rec.cancel')}</button>
          </div>
        )}

        {/* RESET */}
        {step === 'reset' && (
          <div className="najva-step">
            <div className="najva-verified">
              <span className="check">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 L10 18.5 L20 6.5" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              {viaLabel}
            </div>
            <label className="najva-field">
              <span>{t('auth.rec.newpass_lbl')}</span>
              <input className="najva-input" type="password" placeholder={t('auth.rec.pass_ph')} value={newPass} onChange={(e) => setNewPass(e.target.value)} autoFocus />
            </label>
            <label className="najva-field">
              <span>{t('auth.rec.newpass2_lbl')}</span>
              <input className="najva-input" type="password" placeholder={t('auth.rec.pass2_ph')} value={newPass2} onChange={(e) => setNewPass2(e.target.value)} />
            </label>
            {error && <div className="najva-error">{error}</div>}
            <button type="button" className={`najva-btn-primary${busyKind === 'reset' ? ' is-busy' : ''}`} onClick={onConfirmReset} disabled={busy}>
              {busyKind === 'reset' ? <><Spinner />{t('auth.rec.updating')}</> : t('auth.rec.reset_pass')}
            </button>
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <div className="najva-success najva-success-wizard">
            <div className="najva-success-badge">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 L10 18.5 L20 6.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="najva-success-title lg">{t('auth.rec.done_title')}</div>
              <div className="najva-success-sub">{t('auth.rec.done_sub')}</div>
            </div>
            <button type="button" className="najva-btn-cta" onClick={() => navigate('/login')}>{t('auth.rec.go_signin')}</button>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
