import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Chat } from '../../store/chatStore';
import { useChatStore } from '../../store/chatStore';
import UserProfileDrawer from './UserProfileDrawer';
import { formatLastSeen } from '../../utils/timeFormat';
import { initialsOf, avatarGradient } from '../../utils/avatar';
import { useContactsStore } from '../../store/contactsStore';
import { startCall } from '../../lib/calls/callController';
import {
  muteConversation, unmuteConversation,
  blockConversation, deleteConversation,
  clearConversationHistory,
} from '../../lib/conversations';

interface ChatHeaderProps {
  chat: Chat;
}

/**
 * Chat header — faithful port of the Cloud Design's conversation header:
 * avatar/name/status (opens info), a single call button that prompts
 * audio-vs-video, and a three-dot menu (mute / delete / block / clear).
 * Mute/block/delete hit the real backend; clear-history is local only
 * (no server endpoint). ponytail: mute-duration picker is cosmetic — the
 * server mute flag has no duration; every option just mutes.
 */
const ChatHeader: React.FC<ChatHeaderProps> = ({ chat }) => {
  const { t } = useTranslation();
  const { updateChat, removeChat, setMessages } = useChatStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [callChoice, setCallChoice] = useState(false);
  const [mutePicker, setMutePicker] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteWithHistory, setDeleteWithHistory] = useState(false);
  const [deleteForBoth, setDeleteForBoth] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearForBoth, setClearForBoth] = useState(false);

  const isUser = chat.type === 'direct';
  const isGroup = chat.type === 'group';
  const muted = !!chat.muted;
  const blocked = !!chat.blocked;

  const peerName =
    chat.name
    || chat.participants[0]
    || (isGroup ? 'Group' : chat.type === 'channel' ? 'Channel' : 'User');
  const peerId = isUser ? chat.participants.find(p => p !== 'ME') || peerName : peerName;

  const contacts = useContactsStore(state => state.contacts);
  const peerContact = useMemo(() => contacts.find(c => c.username === peerId || c.id === peerId), [contacts, peerId]);

  // Presence comes from the conversation's peer member (live via the `user:status`
  // socket event), NOT the contacts list — a DM peer is usually not a contact.
  const peerStatus = chat.peerStatus || 'OFFLINE';
  const isOnline = peerStatus === 'ONLINE';
  const lastSeenStr = formatLastSeen(chat.peerLastSeen || null, peerStatus, t);
  const n = chat.memberCount ?? 0;
  const displayStatus = isUser
    ? (isOnline ? t('chat.online', 'Online') : lastSeenStr)
    : isGroup
      ? t('chat.membersN', { count: n, defaultValue: '{{count}} members' })
      : chat.type === 'channel'
        ? t('chat.subscribersN', { count: n, defaultValue: '{{count}} subscribers' })
        : ''; // saved messages / other: no member line

  const closeAll = () => { setMenuOpen(false); setCallChoice(false); setMutePicker(false); setBlockConfirm(false); setDeleteConfirm(false); setClearConfirm(false); };

  const doCall = (type: 'audio' | 'video') => { closeAll(); startCall(chat.id, type); };

  const doMute = async () => {
    setMutePicker(false); setMenuOpen(false);
    updateChat(chat.id, { muted: true });
    try { await muteConversation(chat.id); } catch { updateChat(chat.id, { muted: false }); }
  };
  const doUnmute = async () => {
    setMenuOpen(false);
    updateChat(chat.id, { muted: false });
    try { await unmuteConversation(chat.id); } catch { updateChat(chat.id, { muted: true }); }
  };
  const doBlock = async () => {
    closeAll();
    updateChat(chat.id, { blocked: true });
    try { await blockConversation(chat.id); } catch { updateChat(chat.id, { blocked: false }); }
  };
  const doDelete = async () => {
    const deleteHistory = deleteWithHistory;
    const forEveryone = deleteWithHistory && deleteForBoth;
    closeAll(); setDeleteWithHistory(false); setDeleteForBoth(false);
    removeChat(chat.id);
    try { await deleteConversation(chat.id, { deleteHistory, forEveryone }); } catch { /* already removed locally */ }
  };
  const doClear = async () => {
    const forEveryone = clearForBoth;
    closeAll(); setClearForBoth(false);
    setMessages(chat.id, []);
    updateChat(chat.id, { lastMessage: undefined }); // clear the sidebar preview immediately
    try {
      await clearConversationHistory(chat.id, { forEveryone });
    } catch (err) {
      console.error('Failed to clear conversation history:', err);
    }
  };

  const showDots = isUser || isGroup;

  return (
    <>
      <header className="chat-header">
        <div className="chat-header-info" onClick={() => { if (isUser) setDrawerOpen(true); }} style={{ cursor: isUser ? 'pointer' : 'default' }}>
          <div className="nj-avatar sm" style={{ background: avatarGradient(peerName) }}>{initialsOf(peerName)}</div>
          <div>
            <div className="chat-name-row">
              <span className="chat-name">{peerName}</span>
              {muted && (
                <svg className="chat-mute-ic" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8.6 4.6A6 6 0 0 1 18 9c0 3 .8 4.6 1.4 5.4M6.3 6.3C6.1 7.1 6 8 6 9c0 5-2 6-2 6h13M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              )}
            </div>
            <div className={`chat-status ${isUser && isOnline ? 'online' : ''}`}>{displayStatus}</div>
          </div>
        </div>

        <div className="chat-header-actions">
          {isUser && !blocked && (
            <button className="icon-btn" aria-label={t('call.audio', 'Call')} onClick={() => { closeAll(); setCallChoice(true); }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.7 1.5C10.5 19.6 4.4 13.5 3.5 5.7A1.5 1.5 0 0 1 5 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            </button>
          )}
          {showDots && (
            <button className="icon-btn" aria-label={t('chat.more', 'More')} onClick={() => { const o = menuOpen; closeAll(); setMenuOpen(!o); }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
            </button>
          )}
        </div>
      </header>

      {/* three-dot menu */}
      {menuOpen && (
        <>
          <div className="nj-head-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="nj-head-menu">
            <button className="nj-head-menu-row" onClick={() => (muted ? doUnmute() : (setMenuOpen(false), setMutePicker(true)))}>
              <span className="nj-hm-ic teal">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </span>
              <span className="nj-hm-label">{muted ? t('chat.unmute', 'Unmute') : t('chat.muteNotifs', 'Mute notifications')}</span>
              {!muted && <svg className="nj-hm-chev" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
            <button className="nj-head-menu-row" onClick={() => { setMenuOpen(false); setClearConfirm(true); }}>
              <span className="nj-hm-ic amber">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 11l1.5 9h7L17 11M10 4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span className="nj-hm-label">{t('chat.clearHistory', 'Clear history')}</span>
            </button>
            <button className="nj-head-menu-row danger" onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }}>
              <span className="nj-hm-ic danger">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span className="nj-hm-label">{t('chat.deleteChat', 'Delete chat')}</span>
            </button>
            {isUser && (
              <button className="nj-head-menu-row danger" onClick={() => { setMenuOpen(false); setBlockConfirm(true); }}>
                <span className="nj-hm-ic danger">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M5.5 5.5l13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </span>
                <span className="nj-hm-label">{t('chat.block', 'Block')}</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* call choice popup */}
      {callChoice && (
        <>
          <div className="nj-pop-overlay" onClick={() => setCallChoice(false)} />
          <div className="nj-pop">
            <span className="nj-pop-title">{peerName}</span>
            <button className="nj-pop-opt" onClick={() => doCall('audio')}>
              <span className="nj-pop-ic teal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.7 1.5C10.5 19.6 4.4 13.5 3.5 5.7A1.5 1.5 0 0 1 5 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
              {t('chat.voiceCall', 'Voice call')}
            </button>
            <button className="nj-pop-opt" onClick={() => doCall('video')}>
              <span className="nj-pop-ic amber"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M16 10.5 21 8v8l-5-2.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
              {t('chat.videoCall', 'Video call')}
            </button>
            <button className="nj-pop-cancel" onClick={() => setCallChoice(false)}>{t('common.back', 'Back')}</button>
          </div>
        </>
      )}

      {/* mute duration picker (durations cosmetic) */}
      {mutePicker && (
        <>
          <div className="nj-pop-overlay" onClick={() => setMutePicker(false)} />
          <div className="nj-pop">
            <span className="nj-pop-title">{t('chat.muteNotifs', 'Mute notifications')}</span>
            {(['muteForever', 'mute1h', 'mute3h', 'mute3d', 'mute1w'] as const).map((k) => (
              <button key={k} className="nj-pop-opt slim" onClick={doMute}>
                <span className="nj-pop-ic teal"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                {t(`chat.${k}`, { muteForever: 'Until I unmute', mute1h: 'For 1 hour', mute3h: 'For 3 hours', mute3d: 'For 3 days', mute1w: 'For 1 week' }[k])}
              </button>
            ))}
            <button className="nj-pop-cancel" onClick={() => setMutePicker(false)}>{t('common.cancel', 'Cancel')}</button>
          </div>
        </>
      )}

      {/* block confirmation */}
      {blockConfirm && (
        <div className="nj-block-overlay" onClick={() => setBlockConfirm(false)}>
          <div className="nj-block" onClick={(e) => e.stopPropagation()}>
            <div className="nj-block-top">
              <span className="nj-block-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M5.5 5.5l13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
              <span className="nj-block-q">{t('chat.blockConfirm', 'Are you sure you want to block this user?')}</span>
            </div>
            <div className="nj-block-btns">
              <button className="nj-block-no" onClick={() => setBlockConfirm(false)}>{t('common.no', 'No')}</button>
              <button className="nj-block-yes" onClick={doBlock}>{t('chat.block', 'Block')}</button>
            </div>
          </div>
        </div>
      )}

      {/* delete confirmation — optional "delete history" + (animated) "for the other participant" */}
      {deleteConfirm && (
        <div className="nj-block-overlay" onClick={() => { setDeleteConfirm(false); setDeleteWithHistory(false); setDeleteForBoth(false); }}>
          <div className="nj-block" onClick={(e) => e.stopPropagation()}>
            <div className="nj-block-top">
              <span className="nj-block-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              <span className="nj-block-q">{t('chat.deleteConfirm', 'Delete this conversation?')}</span>
            </div>
            <label className="nj-dlg-check">
              <input type="checkbox" checked={deleteWithHistory} onChange={(e) => { setDeleteWithHistory(e.target.checked); if (!e.target.checked) setDeleteForBoth(false); }} />
              <span>{t('chat.deleteHistoryQ', 'Do you also want to delete the chat history?')}</span>
            </label>
            {isUser && (
              <div className={`nj-dlg-subwrap ${deleteWithHistory ? 'open' : ''}`}>
                <label className="nj-dlg-check sub">
                  <input type="checkbox" checked={deleteForBoth} onChange={(e) => setDeleteForBoth(e.target.checked)} />
                  <span>{t('chat.deleteForOther', 'Also delete the conversation for the other participant?')}</span>
                </label>
              </div>
            )}
            <div className="nj-block-btns">
              <button className="nj-block-no" onClick={() => { setDeleteConfirm(false); setDeleteWithHistory(false); setDeleteForBoth(false); }}>{t('common.no', 'No')}</button>
              <button className="nj-block-yes" onClick={doDelete}>{t('common.delete', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* clear-history confirmation — optional "for the other participant" (hard-deletes for both) */}
      {clearConfirm && (
        <div className="nj-block-overlay" onClick={() => { setClearConfirm(false); setClearForBoth(false); }}>
          <div className="nj-block" onClick={(e) => e.stopPropagation()}>
            <div className="nj-block-top">
              <span className="nj-block-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 11l1.5 9h7L17 11M10 4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              <span className="nj-block-q">{t('chat.clearConfirm', 'Clear all messages in this chat?')}</span>
            </div>
            {isUser && (
              <label className="nj-dlg-check">
                <input type="checkbox" checked={clearForBoth} onChange={(e) => setClearForBoth(e.target.checked)} />
                <span>{t('chat.clearForOther', 'Also delete this chat history for the other participant?')}</span>
              </label>
            )}
            <div className="nj-block-btns">
              <button className="nj-block-no" onClick={() => { setClearConfirm(false); setClearForBoth(false); }}>{t('common.no', 'No')}</button>
              <button className="nj-block-yes" onClick={doClear}>{t('chat.clearHistory', 'Clear history')}</button>
            </div>
          </div>
        </div>
      )}

      <UserProfileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversationId={chat.id}
        user={{ username: peerName, displayName: peerContact?.displayName || peerName, status: (peerStatus as 'ONLINE' | 'OFFLINE' | 'AWAY'), lastSeen: chat.peerLastSeen || undefined }}
      />
    </>
  );
};

export default ChatHeader;
