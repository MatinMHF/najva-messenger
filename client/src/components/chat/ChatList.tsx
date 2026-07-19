import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import { initialsOf, avatarGradient } from '../../utils/avatar';

import { useChatStore } from '../../store/chatStore';
import { socketService } from '../../lib/socket';
import { decryptMessage } from '../../lib/crypto/sessionManager';
import { createDirectConversation } from '../../lib/conversations';
import { registerCallSignaling } from '../../lib/calls/callController';
import { enablePush, showAppNotification } from '../../lib/push';
import CreatePanel from './CreatePanel';

const ChatList: React.FC = () => {
  const { t } = useTranslation();
  const { setActiveModal } = useUIStore();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { chats, activeChatId, setActiveChat, setChats } = useChatStore();
  const chatList = Object.values(chats);

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { addMessage } = useChatStore();

  const fetchChats = async () => {
    try {
      const res = await api.get('/conversations');
      const latestChats = useChatStore.getState().chats;
      const mappedChats = await Promise.all(res.data.map(async (conv: any) => {
        const myMember = conv.members.find((m: any) => m.userId === currentUser?.id);
        const clearedAt = myMember?.clearedAt ? new Date(myMember.clearedAt).getTime() : 0;
        let lastMessage;
        // Skip the preview when the caller cleared history past this message —
        // otherwise the sidebar keeps showing an already-cleared last message.
        if (conv.messages?.[0] && new Date(conv.messages[0].createdAt).getTime() > clearedAt) {
          const raw = conv.messages[0];
          const { text, undecryptable } = await decryptMessage(conv.id, raw);
          lastMessage = {
            id: raw.id,
            chatId: conv.id,
            senderId: raw.senderId,
            text,
            timestamp: new Date(raw.createdAt).getTime(),
            status: 'sent' as const,
            isEncrypted: true,
            undecryptable,
          };
        }
        const peer = conv.type === 'DIRECT'
          ? conv.members.find((m: any) => m.userId !== currentUser?.id)?.user
          : undefined;
        return {
          id: conv.id,
          type: conv.type.toLowerCase(),
          name: conv.name || undefined,
          participants: conv.members.filter((m: any) => m.userId !== currentUser?.id).map((m: any) => m.user.displayName || m.user.username),
          lastMessage,
          unreadCount: latestChats[conv.id]?.unreadCount || 0,
          currentKeyVersion: conv.currentKeyVersion ?? 1,
          role: myMember?.role,
          muted: !!myMember?.isMuted,
          blocked: !!myMember?.isBlocked,
          memberCount: conv.members?.length,
          peerId: peer?.id,
          peerStatus: peer?.status,
          peerLastSeen: peer?.lastSeen ?? null,
          lastReadMessageId: myMember?.lastReadMessageId || null,
          pinnedMessageIds: conv.pinnedMessageIds || null,
        };
      }));
      setChats(mappedChats);
    } catch (e) {
      console.error('Failed to fetch chats:', e);
    }
  };

  useEffect(() => {
    fetchChats();
  }, [currentUser?.id]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            void enablePush();
          }
        });
      } else if (Notification.permission === 'granted') {
        void enablePush();
      }
    }
  }, []);

  useEffect(() => {
    socketService.connect();
    if (!socketService.socket) {
      console.log('--- SOCKET STATUS ---', false);
      return;
    }
    console.log('--- SOCKET STATUS ---', socketService.socket.connected);
    
    const handleNewMessage = async (payload: any) => {
      const { message, conversationId } = payload;
      // Skip our own echoed sends (already added optimistically on send).
      if (message.senderId === currentUser?.id) return;
      const { text, undecryptable } = await decryptMessage(conversationId, message);
      const att = message.attachments?.[0];
      addMessage(conversationId, {
        id: message.id,
        chatId: conversationId,
        senderId: message.senderId,
        text,
        timestamp: new Date(message.createdAt).getTime(),
        status: 'sent',
        isEncrypted: true,
        undecryptable,
        type: message.type,
        keyVersion: message.senderKeyVersion ?? 1,
        attachment: att
          ? { id: att.id, encryptedKey: att.encryptedKey, mimeType: att.mimeType, fileName: att.fileName }
          : undefined,
      });
      const latestActiveChatId = useChatStore.getState().activeChatId;
      const isMuted = !!useChatStore.getState().chats[conversationId]?.muted;
      if (conversationId !== latestActiveChatId && !isMuted) {
        const senderName = message.sender?.displayName || message.sender?.username || 'Support';
        // Never surface ciphertext in an OS notification; show a neutral cue.
        const bodyText = undecryptable ? 'New message' : text || 'New message';
        void showAppNotification(senderName, bodyText);
      }

      fetchChats(); // Refresh the list to bump the chat to the top or show new chat
    };

    const handleStatus = ({ userId, status, lastSeen }: { userId: string; status: string; lastSeen?: string }) => {
      const { chats, updateChat } = useChatStore.getState();
      Object.values(chats).forEach((c) => {
        if (c.peerId === userId) updateChat(c.id, { peerStatus: status, peerLastSeen: lastSeen ?? c.peerLastSeen });
      });
    };

    const handleConversationDeleted = ({ conversationId }: { conversationId: string }) => {
      useChatStore.getState().removeChat(conversationId);
    };

    const handleConversationCleared = ({ conversationId }: { conversationId: string }) => {
      const { setMessages, updateChat } = useChatStore.getState();
      setMessages(conversationId, []);
      updateChat(conversationId, { lastMessage: undefined });
    };

    const handlePinnedChanged = ({ conversationId, pinnedMessageIds }: { conversationId: string; pinnedMessageIds: string | null }) => {
      const { updateChat } = useChatStore.getState();
      updateChat(conversationId, { pinnedMessageIds });
    };

    const handleMessageDeleted = ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      const { updateMessage } = useChatStore.getState();
      updateMessage(conversationId, messageId, { deleted: true });
    };

    console.log('--- LISTENING FOR message:new ---');
    socketService.socket.on('message:new', handleNewMessage);
    socketService.socket.on('user:status', handleStatus);
    socketService.socket.on('conversation:deleted', handleConversationDeleted);
    socketService.socket.on('conversation:cleared', handleConversationCleared);
    socketService.socket.on('conversation:pinned_changed', handlePinnedChanged);
    socketService.socket.on('message:deleted', handleMessageDeleted);
    registerCallSignaling();
    return () => {
      socketService.socket?.off('message:new', handleNewMessage);
      socketService.socket?.off('user:status', handleStatus);
      socketService.socket?.off('conversation:deleted', handleConversationDeleted);
      socketService.socket?.off('conversation:cleared', handleConversationCleared);
      socketService.socket?.off('conversation:pinned_changed', handlePinnedChanged);
      socketService.socket?.off('message:deleted', handleMessageDeleted);
    };
  }, []);

  useEffect(() => {
    if (search.trim().length > 0) {
      setIsSearching(true);
      const delayDebounceFn = setTimeout(async () => {
        try {
          const res = await api.get(`/users/search?q=${search}`);
          setSearchResults(res.data.filter((u: any) => u.id !== currentUser?.id));
        } catch (e) {
          console.error(e);
        } finally {
          setIsSearching(false);
        }
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setSearchResults([]);
    }
  }, [search, currentUser?.id]);

  const startDirectMessage = async (user: { id: string; displayName?: string; username?: string; status?: string; lastSeen?: string }) => {
    try {
      if (!currentUser?.id) return;
      const userDisplayName = user.displayName || user.username || 'User';
      const conv = await createDirectConversation(currentUser.id, user.id);
      setChats([{
        id: conv.id,
        type: 'direct' as const,
        participants: [userDisplayName],
        unreadCount: 0,
        currentKeyVersion: conv.currentKeyVersion ?? 1,
        role: 'ADMIN',
        peerId: user.id,
        peerStatus: user.status,
        peerLastSeen: user.lastSeen ?? null,
      }]);
      setActiveChat(conv.id);
      setSearch('');
      void fetchChats(); // pull authoritative peer presence + any existing history
    } catch(e) {
      console.error('Failed to start chat:', e);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const myName = currentUser?.displayName || currentUser?.username || 'User';
  const closeMenu = () => setDropdownOpen(false);

  return (
    <aside className="sidebar">
      <header className="nj-side-head" ref={dropdownRef}>
        <button
          className="nj-side-avatar"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{ background: avatarGradient(myName) }}
          aria-label={t('common.menu', 'Menu')}
          title={t('common.menu', 'Menu')}
        >
          {initialsOf(myName)}
        </button>
        <div className="nj-side-id">
          <span className="nj-side-app">{t('common.app_name', 'Najva')}</span>
          <span className="nj-side-name">{myName}</span>
        </div>

        <div className={`nj-side-dropdown ${dropdownOpen ? 'show' : ''}`}>
          <button type="button" className="dropdown-item" onClick={() => { setActiveModal('profile'); closeMenu(); }}>
            <span className="dropdown-item-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" /><path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
            {t('navigation.profile', 'Profile')}
          </button>
          <button type="button" className="dropdown-item" onClick={() => { setActiveModal('contacts'); closeMenu(); }}>
            <span className="dropdown-item-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 19.5C2 16.5 4.7 14 8 14s6 2.5 6 5.5M16 4.5c3 .5 3 6.5 0 7M17.5 14.5c2.7.6 4.5 2.6 4.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            {t('navigation.contacts', 'Contacts')}
          </button>
          <button type="button" className="dropdown-item" onClick={() => { setActiveModal('settings'); closeMenu(); }}>
            <span className="dropdown-item-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
            {t('navigation.settings', 'Settings')}
          </button>
          <button type="button" className="dropdown-item danger" onClick={() => { setActiveModal('logout'); closeMenu(); }}>
            <span className="dropdown-item-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 4H5v16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 8l4 4-4 4M18 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            {t('navigation.logout', 'Logout')}
          </button>
        </div>
      </header>

      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder={t('common.search', 'Search...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chat-list">
        {search.trim().length > 0 && (
          <div className="nj-list-label">{t('navigation.chats', 'Chats')}</div>
        )}

        {chatList
          .filter(chat => {
            if (search.trim().length === 0) return true;
            const q = search.toLowerCase();
            const label = (chat.name || chat.participants[0] || '').toLowerCase();
            return label.includes(q);
          })
          .map((chat) => {
            const name = chat.name || chat.participants[0] || (chat.type === 'group' ? 'Group' : chat.type === 'channel' ? 'Channel' : 'User');
            return (
              <div
                key={chat.id}
                className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                onClick={() => setActiveChat(chat.id)}
              >
                <div className="nj-avatar" style={{ background: avatarGradient(name) }}>{initialsOf(name)}</div>
                <div className="chat-item-details">
                  <div className="chat-item-header">
                    <span className="chat-name">{name}</span>
                  </div>
                  <span className="chat-item-last-message">
                    {chat.lastMessage ? chat.lastMessage.text : t('chat.new_chat', 'New Chat')}
                  </span>
                </div>
                <div className="chat-item-meta">
                  <span className="chat-time">
                    {chat.lastMessage ? new Date(chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  {chat.unreadCount > 0 && <span className="unread-badge">{chat.unreadCount}</span>}
                </div>
              </div>
            );
          })}

        {chatList.length === 0 && search.trim().length === 0 && (
          <div className="nj-empty-list">{t('chat.no_chats', 'No chats yet')}</div>
        )}

        {search.trim().length > 0 && (
          <>
            <div className="nj-list-label" style={{ marginTop: '0.75rem' }}>
              {t('common.global_search', 'Global Search')}
            </div>
            {isSearching ? (
              <div className="nj-empty-list">{t('common.loading', 'Loading...')}</div>
            ) : searchResults.length > 0 ? (
              searchResults.map(user => {
                const uName = user.displayName || user.username;
                return (
                  <div key={user.id} className="chat-item" onClick={() => startDirectMessage(user)}>
                    <div className="nj-avatar" style={{ background: avatarGradient(uName) }}>{initialsOf(uName)}</div>
                    <div className="chat-item-details">
                      <div className="chat-item-header"><span className="chat-name">{uName}</span></div>
                      <span className="chat-item-last-message">{user.status === 'ONLINE' ? t('chat.online', 'Online') : t('chat.offline', 'Offline')}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="nj-empty-list">{t('common.no_results', 'No users found')}</div>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        className="nj-fab"
        onClick={() => setActiveModal('new-group')}
        aria-label={t('chat.new_group', 'New chat')}
        title={t('chat.new_group', 'New chat')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M14.5 6.5l3 3" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>

      <CreatePanel />
    </aside>
  );
};

export default ChatList;
