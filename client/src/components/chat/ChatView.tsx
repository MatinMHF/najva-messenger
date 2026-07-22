import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { sendEncrypted, sendEncryptedMessage, decryptMessage } from '../../lib/crypto/sessionManager';
import {
  uploadEncryptedAttachment,
  generateImageThumbnail,
  messageTypeForFile,
} from '../../lib/attachments';
import api from '../../lib/api';
import ChatHeader from './ChatHeader';
import MessageInput from './MessageInput';
import AttachmentView from './AttachmentView';
import { unblockConversation } from '../../lib/conversations';

const ChatView: React.FC = () => {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const { activeChatId, messages, chats, addMessage, setMessages, updateChat } = useChatStore();
  const { user } = useAuthStore();

  const activeChat = activeChatId ? chats[activeChatId] : null;
  const chatMessages = activeChatId ? messages[activeChatId] || [] : [];

  // Pinned message cycling
  const [currentPinIndex, setCurrentPinIndex] = useState(0);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);

  // Reply state
  const [replyingMessage, setReplyingMessage] = useState<any | null>(null);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isMouseDownRef = useRef(false);
  const isDraggingSelection = useRef(false);
  const dragStartIdx = useRef<number>(-1);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragMode = useRef<boolean>(true); // true = select, false = deselect
  const longPressTimerRef = useRef<number | null>(null);
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<Set<string>>(new Set());

  // Delete Confirmation states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteForEveryone, setDeleteForEveryone] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 300;
    setShowScrollDown(!isAtBottom);
  };

  const scrollToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const [flashedMessageId, setFlashedMessageId] = useState<string | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  const jumpToMsg = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setFlashedMessageId(messageId);
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashedMessageId(null);
    }, 1300);
  };

  const [historyLoadedChatId, setHistoryLoadedChatId] = useState<string | null>(null);
  const lastReadIdOnOpenRef = useRef<string | null>(null);

  // Load locally deleted messages on click
  useEffect(() => {
    if (!user?.id) return;
    const localDeletedKey = `deleted_msgs_${user.id}`;
    const list = JSON.parse(localStorage.getItem(localDeletedKey) || '[]');
    setLocallyDeletedIds(new Set(list));
    setSelectedIds(new Set());
    setReplyingMessage(null);
    setCurrentPinIndex(0);
  }, [activeChatId, user?.id]);

  // Disable global context menu
  useEffect(() => {
    const preventGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', preventGlobalContextMenu);
    return () => {
      document.removeEventListener('contextmenu', preventGlobalContextMenu);
    };
  }, []);

  // Global mouseup / touchend listener for drag release and long press cleanup
  useEffect(() => {
    const handleGlobalRelease = () => {
      isMouseDownRef.current = false;
      isDraggingSelection.current = false;
      dragStartIdx.current = -1;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('touchcancel', handleGlobalRelease);
    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('touchcancel', handleGlobalRelease);
    };
  }, []);

  // Cleanup flash timeout
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  // Click outside to close context menu
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  // Fetch Message History
  useEffect(() => {
    if (!activeChatId) {
      setHistoryLoadedChatId(null);
      return;
    }

    lastReadIdOnOpenRef.current = chats[activeChatId]?.lastReadMessageId || null;
    setHistoryLoadedChatId(null);

    const fetchHistory = async () => {
      try {
        const res = await api.get(`/conversations/${activeChatId}/messages`);
        const mappedMessages = await Promise.all(
          res.data.map(async (msg: any) => {
            const { text, undecryptable } = await decryptMessage(activeChatId, msg);
            const att = msg.attachments?.[0];
            return {
              id: msg.id,
              chatId: activeChatId,
              senderId: msg.senderId,
              text,
              timestamp: new Date(msg.createdAt).getTime(),
              status: 'sent' as const,
              isEncrypted: true,
              undecryptable,
              type: msg.type,
              deleted: !!msg.deletedAt,
              keyVersion: msg.senderKeyVersion ?? 1,
              attachment: att
                ? { id: att.id, encryptedKey: att.encryptedKey, mimeType: att.mimeType, fileName: att.fileName }
                : undefined,
              replyToId: msg.replyToId || undefined,
            };
          })
        );
        setMessages(activeChatId, mappedMessages.reverse());
        if (mappedMessages.length > 0) {
          const latestMessage = mappedMessages[mappedMessages.length - 1];
          updateChat(activeChatId, { lastReadMessageId: latestMessage.id });
        }
        setHistoryLoadedChatId(activeChatId);
      } catch (err) {
        console.error('Failed to fetch message history:', err);
      }
    };
    fetchHistory();
  }, [activeChatId]);

  const lastScrolledChatIdRef = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Scroll to last read message
  useEffect(() => {
    if (!activeChatId) return;

    const isHistoryReady = historyLoadedChatId === activeChatId;
    if (!isHistoryReady) return;

    if (chatMessages.length === 0) return;

    const isInitialLoad = lastScrolledChatIdRef.current !== activeChatId;
    const lastReadId = lastReadIdOnOpenRef.current;

    if (isInitialLoad) {
      lastScrolledChatIdRef.current = activeChatId;

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = window.setTimeout(() => {
        let scrolled = false;
        if (lastReadId) {
          const el = document.getElementById(`msg-${lastReadId}`);
          if (el) {
            el.scrollIntoView({ block: 'center' });
            scrolled = true;
          }
        }
        if (!scrolled) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
      }, 150);
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [chatMessages.length, activeChatId, activeChat?.lastReadMessageId, historyLoadedChatId]);

  if (!activeChat) {
    return (
      <main className="chat-area nj-empty">
        <img src="/logo.webp" alt="Najva" className="nj-empty-logo" />
        <span className="nj-empty-pill">{t('chat.select_chat', 'Select a chat to start messaging')}</span>
      </main>
    );
  }

  const handleUnblock = async () => {
    if (!activeChatId) return;
    updateChat(activeChatId, { blocked: false });
    try { await unblockConversation(activeChatId); } catch { updateChat(activeChatId, { blocked: true }); }
  };

  const handleSend = async (text: string) => {
    if (!activeChatId) return;
    try {
      const version = activeChat?.currentKeyVersion ?? 1;
      const replyToId = replyingMessage?.id;
      const created = await sendEncrypted(activeChatId, version, text, replyToId);
      addMessage(activeChatId, {
        id: created?.id || Date.now().toString(),
        chatId: activeChatId,
        senderId: user?.id || 'me',
        text,
        timestamp: Date.now(),
        status: 'sent',
        isEncrypted: true,
        replyToId,
      });
      setReplyingMessage(null);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err) {
      console.error('Failed to send message:', err);
      alert(t('chat.sendError', 'Cannot send message. You may have been blocked or lack permissions.'));
    }
  };

  const handleSendMedia = async (file: Blob, fileName: string, mime: string) => {
    if (!activeChatId) return;
    try {
      const version = activeChat?.currentKeyVersion ?? 1;
      const type = messageTypeForFile(mime);
      const thumbnail = type === 'IMAGE' ? await generateImageThumbnail(file) : undefined;
      const uploaded = await uploadEncryptedAttachment(activeChatId, version, file, fileName, { thumbnail, mimeType: mime });
      const replyToId = replyingMessage?.id;
      const created = await sendEncryptedMessage(activeChatId, version, {
        type,
        caption: fileName,
        attachmentIds: [uploaded.id],
        replyToId,
      });
      const att = created?.attachments?.[0];
      addMessage(activeChatId, {
        id: created?.id || Date.now().toString(),
        chatId: activeChatId,
        senderId: user?.id || 'me',
        text: fileName,
        timestamp: Date.now(),
        status: 'sent',
        isEncrypted: true,
        type,
        keyVersion: created?.senderKeyVersion ?? version,
        attachment: att
          ? { id: att.id, encryptedKey: att.encryptedKey, mimeType: att.mimeType, fileName: att.fileName }
          : { id: uploaded.id, encryptedKey: '', mimeType: mime, fileName },
        replyToId,
      });
      setReplyingMessage(null);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      console.error('Failed to send media:', err);
      alert(t('chat.sendError', 'Cannot send message. You may have been blocked or lack permissions.'));
    }
  };

  const visibleMessages = chatMessages.filter(m => !locallyDeletedIds.has(m.id));

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Selection handlers: Click & Drag or Press & Hold (500ms) ONLY. Single clicks do NOT select!
  const handleMessageMouseDown = (e: React.MouseEvent, messageId: string, index: number) => {
    if (e.button !== 0) return;
    isMouseDownRef.current = true;
    isDraggingSelection.current = false;
    dragStartIdx.current = index;
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    cancelLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current && !isDraggingSelection.current) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(messageId)) next.delete(messageId);
          else next.add(messageId);
          return next;
        });
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(40);
        }
      }
    }, 500);
  };

  const handleMessageMouseMove = (e: React.MouseEvent, index: number) => {
    if (!isMouseDownRef.current || dragStartIdx.current === -1) return;
    const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
    if (dist > 8 || index !== dragStartIdx.current) {
      cancelLongPress();
      if (!isDraggingSelection.current) {
        isDraggingSelection.current = true;
        const initialSelected = selectedIds.has(visibleMessages[dragStartIdx.current]?.id);
        dragMode.current = !initialSelected;
      }
      updateDragSelection(index);
    }
  };

  const handleMessageMouseEnter = (index: number) => {
    if (!isMouseDownRef.current || dragStartIdx.current === -1) return;
    if (index !== dragStartIdx.current) {
      cancelLongPress();
      if (!isDraggingSelection.current) {
        isDraggingSelection.current = true;
        const initialSelected = selectedIds.has(visibleMessages[dragStartIdx.current]?.id);
        dragMode.current = !initialSelected;
      }
      updateDragSelection(index);
    }
  };

  const updateDragSelection = (currentIndex: number) => {
    if (dragStartIdx.current === -1) return;
    const start = Math.min(dragStartIdx.current, currentIndex);
    const end = Math.max(dragStartIdx.current, currentIndex);

    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < visibleMessages.length; i++) {
        if (i >= start && i <= end) {
          if (dragMode.current) next.add(visibleMessages[i].id);
          else next.delete(visibleMessages[i].id);
        }
      }
      return next;
    });
  };

  const handleMessageTouchStart = (e: React.TouchEvent, messageId: string) => {
    cancelLongPress();
    const touch = e.touches[0];
    if (!touch) return;
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(40);
      }
    }, 500);
  };

  const handleMessageTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const dist = Math.hypot(touch.clientX - dragStartPos.current.x, touch.clientY - dragStartPos.current.y);
    if (dist > 8) {
      cancelLongPress();
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, messageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    cancelLongPress();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      messageId,
    });
  };

  const handleCopySelected = () => {
    const selectedTexts = chatMessages
      .filter(m => selectedIds.has(m.id) && m.text)
      .map(m => m.text);
    if (selectedTexts.length > 0) {
      navigator.clipboard.writeText(selectedTexts.join('\n'));
    }
    setSelectedIds(new Set());
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false);
    const idsToDelete = singleDeleteId ? [singleDeleteId] : Array.from(selectedIds);
    setSingleDeleteId(null);
    setSelectedIds(new Set());

    const localDeletedKey = `deleted_msgs_${user?.id}`;
    const localDeleted = JSON.parse(localStorage.getItem(localDeletedKey) || '[]');

    for (const id of idsToDelete) {
      if (deleteForEveryone) {
        try {
          await api.delete(`/messages/${id}`);
        } catch (err) {
          console.error('Failed server delete, fallback to local:', err);
          localDeleted.push(id);
        }
      } else {
        localDeleted.push(id);
      }
    }

    localStorage.setItem(localDeletedKey, JSON.stringify(localDeleted));
    setLocallyDeletedIds(new Set(localDeleted));
    setDeleteForEveryone(false);
  };

  // Pinning logic
  const handlePinMessage = async (messageId: string) => {
    setContextMenu(null);
    const action = isPinned(messageId) ? 'unpin' : 'pin';
    try {
      const res = await api.post(`/conversations/${activeChatId}/pin`, { messageId, action });
      updateChat(activeChatId!, { pinnedMessageIds: res.data.pinnedMessageIds });
    } catch (err) {
      console.error('Failed to pin message:', err);
    }
  };

  const isPinned = (messageId: string) => {
    if (!activeChat?.pinnedMessageIds) return false;
    try {
      const list = JSON.parse(activeChat.pinnedMessageIds);
      return Array.isArray(list) && list.includes(messageId);
    } catch {
      return activeChat.pinnedMessageIds.split(',').includes(messageId);
    }
  };

  const getPinnedMessages = () => {
    if (!activeChat?.pinnedMessageIds) return [];
    try {
      const ids: string[] = JSON.parse(activeChat.pinnedMessageIds);
      return chatMessages.filter(m => ids.includes(m.id));
    } catch {
      const ids = activeChat.pinnedMessageIds.split(',').filter(Boolean);
      return chatMessages.filter(m => ids.includes(m.id));
    }
  };

  const pinnedMsgs = getPinnedMessages();

  const handlePinnedBarClick = () => {
    if (pinnedMsgs.length === 0) return;
    const nextIndex = (currentPinIndex + 1) % pinnedMsgs.length;
    setCurrentPinIndex(nextIndex);
    const targetMsg = pinnedMsgs[nextIndex];
    if (targetMsg) {
      jumpToMsg(targetMsg.id);
    }
  };

  const peerName = activeChat.peerId
    ? chats[activeChatId!]?.name || t('chat.direct_chat', 'Private Chat')
    : activeChat.name || t('chat.group', 'Group');

  return (
    <main className="chat-area">
      <ChatHeader chat={activeChat} />

      {pinnedMsgs.length > 0 && (
        <button
          onClick={handlePinnedBarClick}
          className="nj-btn-hover"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            padding: '8px 16px',
            background: 'var(--nj-panel, #fff)',
            border: 'none',
            borderBottom: '1px solid var(--nj-border, #dce9ea)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            flexShrink: 0,
            transition: 'background 0.15s',
            animation: 'najva-drop 0.25s ease both'
          }}
        >
          <span style={{ width: '3px', alignSelf: 'stretch', borderRadius: '2px', background: 'linear-gradient(180deg, #1e8a96, #14707c)', flexShrink: 0 }}></span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: '#1e8a96', flexShrink: 0 }}>
            <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
            <path d="M12 15v6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: '0.7188rem', fontWeight: 800, color: '#1e8a96', textAlign: 'left' }}>
              {t('chat.pinnedMessage', 'Pinned Message')}{pinnedMsgs.length > 1 ? ` ${pinnedMsgs.length - currentPinIndex}/${pinnedMsgs.length}` : ''}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--nj-sub, #5b7f84)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
              {pinnedMsgs[currentPinIndex]?.text || 'Media'}
            </span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nj-muted, #8aa8ac)', flexShrink: 0 }}>
            <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          userSelect: 'none'
        }}
      >
        {visibleMessages.map((msg, index) => {
          const isMine = msg.senderId === 'me' || msg.senderId === user?.id;
          const attFileName = msg.attachment ? (msg.text || msg.attachment.fileName || '') : '';
          const mime = msg.attachment?.mimeType || '';

          const isVoice = !!(!msg.deleted && !msg.undecryptable && msg.attachment &&
            (msg.type?.toUpperCase() === 'VOICE' || mime.startsWith('audio/') || attFileName.trim().startsWith('voice-message.')));
          const isVideo = !!(!msg.deleted && !msg.undecryptable && msg.attachment &&
            (msg.type?.toUpperCase() === 'VIDEO' || mime.startsWith('video/') || attFileName.trim().startsWith('video-message.')));
          const isPhoto = !!(!msg.deleted && !msg.undecryptable && msg.attachment && mime.startsWith('image/'));
          const isFile = !!(!msg.deleted && !msg.undecryptable && msg.attachment && !isVoice && !isVideo && !isPhoto);
          const isMediaOrFile = isVoice || isVideo || isPhoto || isFile;

          const msgTime = new Date(msg.timestamp || (msg as any).createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const repliedMsg = msg.replyToId ? chatMessages.find(m => m.id === msg.replyToId) : null;
          const selected = selectedIds.has(msg.id);

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              onMouseDown={(e) => handleMessageMouseDown(e, msg.id, index)}
              onMouseMove={(e) => handleMessageMouseMove(e, index)}
              onMouseEnter={() => handleMessageMouseEnter(index)}
              onTouchStart={(e) => handleMessageTouchStart(e, msg.id)}
              onTouchMove={handleMessageTouchMove}
              onTouchEnd={cancelLongPress}
              onContextMenu={(e) => handleMessageContextMenu(e, msg.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                justifyContent: isMine ? 'flex-end' : 'flex-start',
                padding: '3px 6px',
                borderRadius: '12px',
                backgroundColor: selected
                  ? 'rgba(30, 138, 150, 0.12)'
                  : flashedMessageId === msg.id
                  ? 'rgba(245, 166, 35, 0.18)'
                  : 'transparent',
                transition: 'background 0.25s',
              }}
            >
              {selected && (
                <span style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'linear-gradient(135deg, #1e8a96, #14707c)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'najva-badge-pop 0.25s cubic-bezier(0.22, 1.4, 0.36, 1) both'
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M4 12.5 L10 18.5 L20 6.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              {isPinned(msg.id) && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: '#1e8a96', flexShrink: 0, opacity: 0.8 }}>
                  <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
                  <path d="M12 15v6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              )}
              <div style={{
                maxWidth: '68%',
                padding: isMediaOrFile ? '0' : '10px 14px',
                fontSize: '0.875rem',
                lineHeight: 1.45,
                borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                color: isMine ? '#ffffff' : 'var(--nj-ink, #0e4f58)',
                background: isMine ? 'linear-gradient(135deg, #1e8a96, #14707c)' : 'var(--nj-panel, #ffffff)',
                boxShadow: isMediaOrFile ? 'none' : '0 2px 8px -4px rgba(10,40,46,0.25)',
                animation: 'najva-bubble 0.3s ease both'
              }}>
                {repliedMsg && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToMsg(repliedMsg.id);
                    }}
                    style={{
                      borderInlineStart: '3px solid currentColor',
                      padding: '4px 10px',
                      marginBottom: '6px',
                      borderRadius: '6px',
                      background: 'rgba(127, 127, 127, 0.14)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontSize: '0.7188rem', fontWeight: 800, opacity: 0.95 }}>
                      {repliedMsg.senderId === user?.id || repliedMsg.senderId === 'me' ? t('chat.you', 'You') : (activeChat.name || peerName)}
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                      {repliedMsg.text || 'Media'}
                    </div>
                  </div>
                )}
                {isMediaOrFile ? (
                  <AttachmentView
                    conversationId={msg.chatId}
                    keyVersion={msg.keyVersion ?? 1}
                    attachment={{ ...msg.attachment!, fileName: attFileName }}
                    isMine={isMine}
                    msgTime={msgTime}
                    isVoice={isVoice}
                    isVideo={isVideo}
                  />
                ) : (
                  <>
                    <span>
                      {msg.deleted
                        ? t('chat.message_deleted', 'This message was deleted')
                        : msg.undecryptable
                        ? `🔒 ${t('chat.undecryptable', 'Unable to decrypt this message')}`
                        : msg.text}
                    </span>
                    <div style={{ fontSize: '0.6563rem', marginTop: '3px', textAlign: 'right', opacity: 0.65 }}>{msgTime}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyingMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px', background: 'var(--nj-panel, #fff)', borderTop: '1px solid var(--nj-border, #dce9ea)', flexShrink: 0, animation: 'najva-rise 0.2s ease both' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#1e8a96', flexShrink: 0 }}>
            <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px', borderInlineStart: '3px solid #1e8a96', paddingInlineStart: '10px', textAlign: 'left' }}>
            <span style={{ fontSize: '0.7188rem', fontWeight: 800, color: '#1e8a96' }}>
              {replyingMessage.senderId === user?.id || replyingMessage.senderId === 'me' ? t('chat.you', 'You') : (activeChat.name || peerName)}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--nj-sub, #5b7f84)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {replyingMessage.text || 'Media'}
            </span>
          </span>
          <button
            onClick={() => setReplyingMessage(null)}
            title={t('common.cancel', 'Cancel')}
            className="nj-btn-hover"
            style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nj-muted, #8aa8ac)', transition: 'background 0.15s, transform 0.15s' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{
          position: 'absolute',
          bottom: showScrollDown ? '146px' : '86px',
          left: 0,
          right: 0,
          margin: '0 auto',
          zIndex: 55,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '6px',
          padding: '8px 10px 8px 16px',
          borderRadius: '16px',
          background: 'var(--nj-panel, #fff)',
          border: '1px solid var(--nj-border, #dce9ea)',
          boxShadow: '0 18px 44px -14px rgba(10, 40, 46, 0.45)',
          animation: 'najva-rise 0.25s ease both',
          transition: 'bottom 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          maxWidth: '90vw',
          width: 'max-content',
          boxSizing: 'border-box'
        }}>
          <span style={{ fontSize: '0.8438rem', fontWeight: 800, color: 'var(--nj-ink, #0e4f58)', whiteSpace: 'nowrap' }}>
            {t('chat.selectedCount', '{{count}} selected', { count: selectedIds.size })}
          </span>
          <button onClick={handleCopySelected} className="nj-btn-hover" style={{ padding: '9px 14px', border: 'none', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: 800, color: '#17808d', transition: 'background 0.15s, transform 0.15s' }}>
            {t('chat.copyText', 'Copy text')}
          </button>
          <button onClick={() => setShowDeleteConfirm(true)} className="nj-btn-hover-danger" style={{ padding: '9px 14px', border: 'none', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: 800, color: '#d9534a', transition: 'background 0.15s, transform 0.15s' }}>
            {t('common.delete', 'Delete')}
          </button>
          <button onClick={() => setSelectedIds(new Set())} title={t('common.cancel', 'Cancel')} className="nj-btn-hover" style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nj-muted, #8aa8ac)', transition: 'background 0.15s, transform 0.15s' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {activeChat.type === 'direct' && activeChat.blocked ? (
        <div className="nj-blocked-bar">
          <span className="nj-blocked-text">{t('chat.blockedNotice', 'You blocked this user')}</span>
          <button className="nj-blocked-unblock" onClick={handleUnblock}>{t('chat.unblock', 'Unblock')}</button>
        </div>
      ) : (
        <MessageInput
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          showScrollDown={showScrollDown}
          scrollToLatest={scrollToLatest}
        />
      )}

      {contextMenu && (
        <>
          <div onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: 140 }}></div>
          <div
            style={{
              position: 'fixed',
              top: `${Math.min(contextMenu.y, window.innerHeight - 270)}px`,
              left: `${Math.min(contextMenu.x, window.innerWidth - 232)}px`,
              zIndex: 145,
              width: '218px',
              background: 'var(--nj-panel, #fff)',
              border: '1px solid var(--nj-border, #dce9ea)',
              borderRadius: '14px',
              boxShadow: '0 18px 44px -14px rgba(10, 40, 46, 0.45)',
              padding: '5px',
              animation: 'najva-drop 0.18s cubic-bezier(0.22, 1, 0.36, 1) both'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                const msg = chatMessages.find(m => m.id === contextMenu.messageId);
                if (msg) setReplyingMessage(msg);
                setContextMenu(null);
              }}
              className="nj-btn-hover"
              style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '10px 11px', border: 'none', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8438rem', fontWeight: 700, color: 'var(--nj-ink, #0e4f58)', transition: 'background 0.15s, transform 0.15s' }}
            >
              <span style={{ display: 'inline-flex', color: '#1e8a96' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M9 14 4 9l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 9h10a6 6 0 0 1 6 6v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>{t('chat.reply', 'Reply')}</span>
            </button>
            <button
              onClick={() => {
                setSelectedIds(prev => new Set(prev).add(contextMenu.messageId));
                setContextMenu(null);
              }}
              className="nj-btn-hover"
              style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '10px 11px', border: 'none', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8438rem', fontWeight: 700, color: 'var(--nj-ink, #0e4f58)', transition: 'background 0.15s, transform 0.15s' }}
            >
              <span style={{ display: 'inline-flex', color: '#1e8a96' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12.5 L10 18.5 L20 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>{t('chat.select', 'Select')}</span>
            </button>
            <button
              onClick={() => {
                const msg = chatMessages.find(m => m.id === contextMenu.messageId);
                if (msg && msg.text) {
                  navigator.clipboard.writeText(msg.text);
                }
                setContextMenu(null);
              }}
              className="nj-btn-hover"
              style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '10px 11px', border: 'none', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8438rem', fontWeight: 700, color: 'var(--nj-ink, #0e4f58)', transition: 'background 0.15s, transform 0.15s' }}
            >
              <span style={{ display: 'inline-flex', color: '#1e8a96' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M9 9h11v11H9V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 15H4V4h11v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>{t('chat.copyText', 'Copy text')}</span>
            </button>
            <button
              onClick={() => handlePinMessage(contextMenu.messageId)}
              className="nj-btn-hover"
              style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '10px 11px', border: 'none', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8438rem', fontWeight: 700, color: 'var(--nj-ink, #0e4f58)', transition: 'background 0.15s, transform 0.15s' }}
            >
              <span style={{ display: 'inline-flex', color: '#e08c0b' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M12 15v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {isPinned(contextMenu.messageId) ? t('chat.unpin', 'Unpin') : t('chat.pin', 'Pin')}
              </span>
            </button>
            <button
              onClick={() => {
                setSingleDeleteId(contextMenu.messageId);
                setShowDeleteConfirm(true);
                setContextMenu(null);
              }}
              className="nj-btn-hover-danger"
              style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '10px 11px', border: 'none', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8438rem', fontWeight: 700, color: '#d9534a', transition: 'background 0.15s, transform 0.15s' }}
            >
              <span style={{ display: 'inline-flex', color: '#d9534a' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M9 7V5h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>{t('common.delete', 'Delete')}</span>
            </button>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <>
          <div onClick={() => { setShowDeleteConfirm(false); setSingleDeleteId(null); }} style={{ position: 'fixed', inset: 0, zIndex: 156, background: 'rgba(5, 22, 26, 0.55)', animation: 'najva-fade 0.25s ease both', cursor: 'pointer' }}></div>
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 157, width: '350px', maxWidth: '90vw', background: 'var(--nj-panel, #fff)', border: '1px solid var(--nj-border, #dce9ea)', borderRadius: '18px', padding: '24px 22px 20px', boxShadow: '0 30px 80px -20px rgba(5, 22, 26, 0.6)', display: 'flex', flexDirection: 'column', gap: '16px', animation: 'najva-modal 0.25s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0, background: 'rgba(224, 82, 66, 0.12)', color: '#d9534a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <span style={{ fontSize: '0.9375rem', fontWeight: 800, lineHeight: 1.45, color: 'var(--nj-ink, #0e4f58)' }}>{t('chat.deleteMessagesConfirm', 'Are you sure?')}</span>
            </div>
            {activeChat.type === 'direct' && (
              <button
                type="button"
                onClick={() => setDeleteForEveryone(v => !v)}
                className="nj-btn-hover"
                style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '10px 12px', border: '1px solid var(--nj-border, #dce9ea)', borderRadius: '12px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8438rem', fontWeight: 700, color: 'var(--nj-ink, #0e4f58)', textAlign: 'left', transition: 'background 0.15s' }}
              >
                <span style={{ width: '21px', height: '21px', borderRadius: '7px', flexShrink: 0, border: `2px solid ${deleteForEveryone ? '#1e8a96' : 'var(--nj-border, #dce9ea)'}`, background: deleteForEveryone ? 'linear-gradient(135deg, #1e8a96, #14707c)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, border-color 0.15s' }}>
                  {deleteForEveryone && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 L10 18.5 L20 6.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                </span>
                {t('chat.deleteForEveryone', { name: peerName })}
              </button>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowDeleteConfirm(false); setSingleDeleteId(null); }} className="nj-btn-hover" style={{ flex: 1, padding: '12px', fontSize: '0.875rem', fontWeight: 700, fontFamily: 'inherit', color: '#17808d', background: 'transparent', border: '1.5px solid #1e8a96', borderRadius: '11px', cursor: 'pointer', transition: 'background 0.15s' }}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button onClick={handleDeleteConfirm} className="nj-btn-hover-scale" style={{ flex: 1, padding: '12px', fontSize: '0.875rem', fontWeight: 800, fontFamily: 'inherit', color: '#fff', background: 'linear-gradient(135deg, #e05242, #c0392b)', border: 'none', borderRadius: '11px', cursor: 'pointer', transition: 'transform 0.15s' }}>
                {t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
};

export default ChatView;
