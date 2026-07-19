import { create } from 'zustand';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string; // DECRYPTED plaintext (or '' when undecryptable) — never ciphertext
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  isEncrypted: boolean;
  undecryptable?: boolean;
  type?: string;
  deleted?: boolean;
  keyVersion?: number;
  attachment?: {
    id: string;
    encryptedKey: string;
    mimeType: string;
    fileName?: string;
  };
  replyToId?: string;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group' | 'channel';
  /** Group/channel title from the server; DMs leave this unset and use participants[0]. */
  name?: string;
  participants: string[];
  lastMessage?: Message;
  unreadCount: number;
  currentKeyVersion?: number; // CK version to encrypt new messages under
  role?: string; // caller's MemberRole in this conversation (channel post gating)
  muted?: boolean; // this member's isMuted flag
  blocked?: boolean; // this member's isBlocked flag (DM only)
  memberCount?: number; // total members (group/channel header status)
  peerId?: string; // DM only: the other participant's userId (for presence lookup)
  peerStatus?: 'ONLINE' | 'OFFLINE' | 'AWAY' | string; // DM peer's live presence
  peerLastSeen?: string | null; // DM peer's last-seen ISO timestamp
  lastReadMessageId?: string | null;
  pinnedMessageIds?: string | null;
}

interface ChatState {
  chats: Record<string, Chat>;
  messages: Record<string, Message[]>;
  activeChatId: string | null;
  setActiveChat: (chatId: string | null) => void;
  setChats: (chats: Chat[]) => void;
  updateChat: (chatId: string, patch: Partial<Chat>) => void;
  removeChat: (chatId: string) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, patch: Partial<Message>) => void;
  updateMessageStatus: (chatId: string, messageId: string, status: Message['status']) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: {},
  messages: {},
  activeChatId: null,
  setActiveChat: (chatId) => set((state) => {
    const newChats = { ...state.chats };
    if (chatId && newChats[chatId]) {
      newChats[chatId] = { ...newChats[chatId], unreadCount: 0 };
    }
    return { activeChatId: chatId, chats: newChats };
  }),
  setChats: (chatsList) => set((state) => {
    const newChats = { ...state.chats };
    chatsList.forEach(chat => {
      newChats[chat.id] = chat;
    });
    return { chats: newChats };
  }),
  updateChat: (chatId, patch) => set((state) => (
    state.chats[chatId] ? { chats: { ...state.chats, [chatId]: { ...state.chats[chatId], ...patch } } } : {}
  )),
  removeChat: (chatId) => set((state) => {
    const chats = { ...state.chats }; delete chats[chatId];
    const messages = { ...state.messages }; delete messages[chatId];
    return { chats, messages, activeChatId: state.activeChatId === chatId ? null : state.activeChatId };
  }),
  setMessages: (chatId, messagesList) => set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: messagesList
    }
  })),
  addMessage: (chatId, message) => set((state) => {
    const currentMessages = state.messages[chatId] || [];
    if (currentMessages.some(m => m.id === message.id)) {
      return {};
    }
    
    const newChats = { ...state.chats };
    if (chatId !== state.activeChatId && newChats[chatId]) {
      newChats[chatId] = { ...newChats[chatId], unreadCount: newChats[chatId].unreadCount + 1 };
    }
    return {
      chats: newChats,
      messages: {
        ...state.messages,
        [chatId]: [...currentMessages, message]
      }
    };
  }),
  updateMessage: (chatId, messageId, patch) => set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: (state.messages[chatId] || []).map(msg =>
        msg.id === messageId ? { ...msg, ...patch } : msg
      )
    }
  })),
  updateMessageStatus: (chatId, messageId, status) => set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: (state.messages[chatId] || []).map(msg =>
        msg.id === messageId ? { ...msg, status } : msg
      )
    }
  })),
}));
