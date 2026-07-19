import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pushSupported, isPushEnabled } from '../lib/push';

const DISMISS_KEY = 'najva_battery_notice_dismissed';

/**
 * Guidance for the self-hosted fallback (Module F). When OS-level push isn't
 * active, background delivery relies on the persistent WebSocket — which mobile
 * battery optimization / app-standby can kill. On mobile without push enabled we
 * show one-time guidance to exempt the app from battery optimization so the
 * fallback channel stays alive in the background. (A fully-killed app with no OS
 * push is an accepted, out-of-scope gap.)
 */
const BatteryOptimizationNotice: React.FC = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) return;
    (async () => {
      // Show only when we're actually relying on the WS fallback (push not on).
      const pushOn = pushSupported() ? await isPushEnabled() : false;
      if (!pushOn) setShow(true);
    })();
  }, []);

  if (!show) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, '1'); setShow(false); };

  return (
    <div style={{ background: 'var(--bg-surface, #1c1c22)', color: 'var(--text-main, #fff)', borderBottom: '1px solid var(--border-color, #333)', padding: '0.6rem 1rem', fontSize: '0.85rem', display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ flex: 1 }}>
        🔋 {t('notifications.battery_hint', 'To keep receiving messages when the app is in the background, allow notifications and exempt Najva from battery optimization in your device settings.')}
      </span>
      <button onClick={dismiss} className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
        {t('common.dismiss', 'Dismiss')}
      </button>
    </div>
  );
};

export default BatteryOptimizationNotice;
