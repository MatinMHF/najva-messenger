import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHistoryLost, clearHistoryLost } from '../../lib/historyLost';

/**
 * A lasting notice shown after a flow-D (cryptographic-loss) reset, warning that
 * messages from before the reset are permanently unreadable. Dismissible — the
 * user opts to stop seeing it once they understand.
 */
export const HistoryLostBanner: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(isHistoryLost());

  if (!visible) return null;

  const dismiss = () => {
    clearHistoryLost();
    setVisible(false);
  };

  return (
    <div
      role="status"
      style={{ background: 'rgba(220,53,69,0.12)', borderBottom: '1px solid var(--error-color, #dc3545)', color: 'var(--text-main)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}
    >
      <span style={{ flex: 1 }}>
        {t('historyLost.banner', 'Your account was recovered from scratch. Messages and files from before the recovery are permanently unreadable.')}
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="btn-outline"
        style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', flexShrink: 0 }}
      >
        {t('historyLost.dismiss', 'Got it')}
      </button>
    </div>
  );
};
