import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '../../store/authStore';
import { formatLastSeen } from '../../utils/timeFormat';
import { useContactsStore } from '../../store/contactsStore';
import { useChatStore } from '../../store/chatStore';
import { initialsOf, avatarGradient } from '../../utils/avatar';
import { startCall } from '../../lib/calls/callController';
import { muteConversation, unmuteConversation, blockConversation } from '../../lib/conversations';

interface UserProfileDrawerProps {
  user: Partial<User>;
  isOpen: boolean;
  onClose: () => void;
  /** Conversation to place calls into / mute / block (from ChatHeader). */
  conversationId?: string;
}

/**
 * User info page — faithful port of the design's INFO PAGE (centered modal).
 * Action grid matches Cloud Design exactly: Message / Mute / Call / More.
 *  - Message → back to the chat (close)
 *  - Mute    → toggle real mute (POST/DELETE /:id/mute)
 *  - Call    → Voice/Video choice → startCall
 *  - More    → submenu: add/remove contact, block (real)
 */
const UserProfileDrawer: React.FC<UserProfileDrawerProps> = ({ user, isOpen, onClose, conversationId }) => {
  const { t } = useTranslation();
  const contactsStore = useContactsStore();
  const chat = useChatStore((s) => (conversationId ? s.chats[conversationId] : undefined));
  const updateChat = useChatStore((s) => s.updateChat);

  const [copied, setCopied] = useState(false);
  const [callChoice, setCallChoice] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);

  const muted = !!chat?.muted;
  const blocked = !!chat?.blocked;
  const isContact = user.id ? contactsStore.isContact(user.id) : false;
  const name = user.displayName || user.username || 'User';

  const handleToggleContact = () => {
    if (!user.id || !user.username) return;
    if (isContact) contactsStore.removeContact(user.id);
    else contactsStore.addContact({ id: user.id, username: user.username, displayName: name });
    setMoreOpen(false);
  };

  const copyUsername = () => {
    if (!user.username) return;
    navigator.clipboard.writeText('@' + user.username);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const call = (type: 'audio' | 'video') => {
    setCallChoice(false);
    if (conversationId) startCall(conversationId, type);
    onClose();
  };

  const toggleMute = async () => {
    if (!conversationId) return;
    if (muted) {
      updateChat(conversationId, { muted: false });
      try { await unmuteConversation(conversationId); } catch { updateChat(conversationId, { muted: true }); }
    } else {
      updateChat(conversationId, { muted: true });
      try { await muteConversation(conversationId); } catch { updateChat(conversationId, { muted: false }); }
    }
  };

  const doBlock = async () => {
    setBlockConfirm(false);
    if (!conversationId) return;
    updateChat(conversationId, { blocked: true });
    try { await blockConversation(conversationId); } catch { updateChat(conversationId, { blocked: false }); }
  };

  if (!isOpen) return null;

  const Action: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
    <button className="nj-info-action" onClick={onClick}>{children}{label}</button>
  );

  return (
    <>
      <div className="nj-info-overlay" onClick={onClose}>
        <div className="nj-info" onClick={(e) => e.stopPropagation()}>
          <div className="nj-info-head">
            <button className="nj-panel-back" onClick={onClose} aria-label={t('common.close', 'Close')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="nj-info-title">{t('profile.title', 'User Info')}</span>
          </div>

          <div className="nj-info-body">
            <div className="nj-info-hero">
              <div className="nj-info-avatar" style={{ background: user.avatarUrl ? 'transparent' : avatarGradient(name) }}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt={name} /> : initialsOf(name)}
              </div>
              <div>
                <div className="nj-info-name">{name}</div>
                <div className="nj-info-sub">
                  {user.status === 'ONLINE' ? t('chat.online', 'Online') : formatLastSeen(user.lastSeen || null, user.status || 'OFFLINE', t)}
                </div>
              </div>
            </div>

            {/* Cloud Design action grid: Message / Mute / Call / More */}
            <div className="nj-info-actions" style={{ ['--cols' as any]: 4 }}>
              <Action label={t('chat.message', 'Message')} onClick={onClose}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
              </Action>
              <Action label={muted ? t('chat.unmute', 'Unmute') : t('chat.mute', 'Mute')} onClick={toggleMute}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </Action>
              <Action label={t('call.title', 'Call')} onClick={() => setCallChoice(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.7 1.5C10.5 19.6 4.4 13.5 3.5 5.7A1.5 1.5 0 0 1 5 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
              </Action>
              <Action label={t('chat.more', 'More')} onClick={() => setMoreOpen((v) => !v)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              </Action>
            </div>

            {moreOpen && (
              <div className="nj-info-more">
                <button className="nj-listrow" onClick={handleToggleContact}>
                  <span className="nj-listrow-icon" style={{ color: 'var(--nj-teal)', background: 'rgba(30,138,150,0.1)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" /><path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </span>
                  <span className="nj-listrow-text"><span className="nj-listrow-label">{isContact ? t('chat.removeContact', 'Remove from Contacts') : t('chat.addContact', 'Add to Contacts')}</span></span>
                </button>
                {!blocked && (
                  <button className="nj-listrow danger" onClick={() => { setMoreOpen(false); setBlockConfirm(true); }}>
                    <span className="nj-listrow-icon" style={{ color: '#d9534a', background: 'rgba(224,82,66,0.1)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M5.5 5.5l13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </span>
                    <span className="nj-listrow-text"><span className="nj-listrow-label" style={{ color: '#d9534a' }}>{t('chat.blockUser', 'Block User')}</span></span>
                  </button>
                )}
              </div>
            )}

            <button className="nj-info-copy" onClick={copyUsername} title={t('profile.tapToCopy', 'Tap to copy')}>
              <span className="nj-info-copy-text">
                <span className="nj-info-copy-label">{t('profile.username', 'Username')}</span>
                <span className="nj-info-copy-val" dir="ltr">{user.username ? `@${user.username}` : '—'}</span>
              </span>
              {copied ? (
                <span className="nj-info-copied">{t('common.copied', 'Copied!')}</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nj-muted)', flexShrink: 0 }}><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="2" /></svg>
              )}
            </button>

            <div className="nj-info-bio">
              <span className="nj-info-bio-label">{t('profile.bio', 'Bio')}</span>
              <span className="nj-info-bio-text">{user.bio || t('profile.noBio', 'No bio provided.')}</span>
            </div>

            {blocked && (
              <div className="nj-panel-note" style={{ textAlign: 'center', color: '#d9534a', fontWeight: 700 }}>
                {t('chat.blockedNotice', 'You blocked this user')}
              </div>
            )}
          </div>
        </div>
      </div>

      {callChoice && (
        <>
          <div className="nj-pop-overlay" onClick={() => setCallChoice(false)} />
          <div className="nj-pop">
            <span className="nj-pop-title">{name}</span>
            <button className="nj-pop-opt" onClick={() => call('audio')}>
              <span className="nj-pop-ic teal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.7 1.5C10.5 19.6 4.4 13.5 3.5 5.7A1.5 1.5 0 0 1 5 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
              {t('chat.voiceCall', 'Voice call')}
            </button>
            <button className="nj-pop-opt" onClick={() => call('video')}>
              <span className="nj-pop-ic amber"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M16 10.5 21 8v8l-5-2.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
              {t('chat.videoCall', 'Video call')}
            </button>
            <button className="nj-pop-cancel" onClick={() => setCallChoice(false)}>{t('common.back', 'Back')}</button>
          </div>
        </>
      )}

      {blockConfirm && (
        <div className="nj-block-overlay" onClick={() => setBlockConfirm(false)}>
          <div className="nj-block" onClick={(e) => e.stopPropagation()}>
            <div className="nj-block-top">
              <span className="nj-block-ic">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M5.5 5.5l13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </span>
              <span className="nj-block-q">{t('chat.blockConfirm', 'Are you sure you want to block this user?')}</span>
            </div>
            <div className="nj-block-btns">
              <button className="nj-block-no" onClick={() => setBlockConfirm(false)}>{t('common.no', 'No')}</button>
              <button className="nj-block-yes" onClick={doBlock}>{t('chat.block', 'Block')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserProfileDrawer;
