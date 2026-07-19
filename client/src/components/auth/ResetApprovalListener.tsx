import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { socketService } from '../../lib/socket';
import { useAuthStore } from '../../store/authStore';
import { loadMasterKey } from '../../lib/crypto/keystore';
import { sealEnvelope } from '../../lib/crypto/envelope';
import { fingerprintWords } from '../../lib/crypto/fingerprint';
import { base64ToArrayBuffer } from '../../lib/crypto/utils';
import api from '../../lib/api';

interface PendingReset {
  resetId: string;
  ephemeralPub: string;
  deviceInfo: { userAgent: string | null; ip: string | null };
  words: string[];
}

/**
 * Recovery flow C, device-A side (docs/ENCRYPTION.md). A logged-in device listens
 * for `reset:pending` and prompts the user to approve a password reset started on
 * another device — showing the requester's info and a 6-word fingerprint of the
 * ephemeral key the user must compare visually (server key-swap MITM check).
 * Approving seals THIS device's master key to that ephemeral key.
 */
export const ResetApprovalListener: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [pending, setPending] = useState<PendingReset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handlerRef = useRef<((d: unknown) => void) | null>(null);

  useEffect(() => {
    const handler = async (raw: unknown) => {
      const data = raw as { resetId: string; ephemeralPub: string; deviceInfo?: { userAgent: string | null; ip: string | null } };
      if (!data?.resetId || !data?.ephemeralPub) return;
      try {
        const words = await fingerprintWords(data.ephemeralPub);
        setError('');
        setPending({
          resetId: data.resetId,
          ephemeralPub: data.ephemeralPub,
          deviceInfo: data.deviceInfo ?? { userAgent: null, ip: null },
          words,
        });
      } catch {
        // A malformed key just means no prompt — safe to ignore.
      }
    };
    handlerRef.current = handler;

    const attach = (): boolean => {
      const s = socketService.socket;
      if (!s) return false;
      s.off('reset:pending', handler);
      s.on('reset:pending', handler);
      return true;
    };

    if (attach()) {
      return () => { socketService.socket?.off('reset:pending', handler); };
    }
    // Socket not connected yet — retry until it is.
    const id = setInterval(() => { if (attach()) clearInterval(id); }, 1000);
    return () => {
      clearInterval(id);
      socketService.socket?.off('reset:pending', handler);
    };
  }, []);

  const approve = async () => {
    if (!pending || !user) return;
    setBusy(true);
    setError('');
    try {
      const mk = await loadMasterKey(user.id);
      if (!mk) {
        setError(t('resetApproval.noKey', "This device can't access your encryption key. Approve from a device where you're fully signed in."));
        setBusy(false);
        return;
      }
      const pub = new Uint8Array(base64ToArrayBuffer(pending.ephemeralPub));
      const sealedMk = sealEnvelope(pub, mk);
      mk.fill(0);
      await api.post('/auth/reset/approve', { resetId: pending.resetId, sealedMk });
      setPending(null);
    } catch {
      setError(t('resetApproval.failed', 'Could not approve the reset. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const deny = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await api.post('/auth/reset/deny', { resetId: pending.resetId });
    } catch {
      // Best-effort — the request also expires on its own.
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  if (!pending) return null;

  const deviceLabel = pending.deviceInfo.userAgent || t('resetApproval.unknownDevice', 'an unrecognized device');

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '1rem' }}
    >
      <div style={{ background: 'var(--surface-1, #1e1e1e)', color: 'var(--text-main, #fff)', borderRadius: 'var(--radius-lg, 14px)', padding: '1.5rem', maxWidth: 420, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('resetApproval.title', 'Approve a password reset?')}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {t('resetApproval.body', 'A password reset was requested from {{device}}. Only approve if this was you.', { device: deviceLabel })}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
          {t('resetApproval.fingerprintHint', 'Confirm these words match the ones on the other device:')}
        </p>
        <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', margin: '0 0 1rem' }}>
          {pending.words.map((w, i) => (
            <span key={i} style={{ fontFamily: 'monospace', fontWeight: 700, padding: '0.35rem 0.6rem', borderRadius: '8px', background: 'rgba(127,127,127,0.18)' }}>{w}</span>
          ))}
        </div>
        {error && <div style={{ color: 'var(--error-color, #dc3545)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={deny} disabled={busy} className="btn-outline" style={{ padding: '0.5rem 1rem' }}>
            {t('resetApproval.deny', 'Deny')}
          </button>
          <button type="button" onClick={approve} disabled={busy} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
            {busy ? t('common.loading', 'Loading...') : t('resetApproval.approve', 'Approve')}
          </button>
        </div>
      </div>
    </div>
  );
};
