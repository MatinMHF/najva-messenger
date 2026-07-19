import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';

/**
 * Logout confirmation only — design's red-accented dialog (reuse .nj-block).
 * Create/profile/contacts/settings live in CreatePanel / SlidingPanel.
 */
const ChatModals: React.FC = () => {
  const { t } = useTranslation();
  const { activeModal, setActiveModal } = useUIStore();
  const { logout } = useAuthStore();

  if (activeModal !== 'logout') return null;

  const close = () => setActiveModal(null);
  const confirm = () => { setActiveModal(null); logout(); };

  return (
    <div className="nj-block-overlay" onClick={close} role="presentation">
      <div className="nj-block" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="nj-block-top">
          <span className="nj-block-ic" aria-hidden>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M9 4H5v16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 8l4 4-4 4M18 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="nj-block-q">
            {t('auth.logout_confirm', 'Are you sure you want to log out?')}
          </span>
        </div>
        <div className="nj-block-btns">
          <button type="button" className="nj-block-no" onClick={close}>
            {t('common.no', 'No')}
          </button>
          <button type="button" className="nj-block-yes" onClick={confirm}>
            {t('common.yes', 'Yes')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatModals;
