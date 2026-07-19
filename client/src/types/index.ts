export type UserStatus = 'online' | 'offline' | 'away' | 'busy';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
  lastSeen?: Date;
  bio?: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'file' | 'voice';

export interface BaseMessage {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;
  createdAt: Date;
  updatedAt?: Date;
  isRead: boolean;
  replyToMessageId?: string;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  text: string;
}

export interface MediaMessage extends BaseMessage {
  type: 'image' | 'video' | 'voice';
  mediaUrl: string;
  mimeType: string;
  size: number;
  duration?: number; // Used for video and voice messages
  thumbnailUrl?: string;
}

export interface FileMessage extends BaseMessage {
  type: 'file';
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export type Message = TextMessage | MediaMessage | FileMessage;

export type ChatType = 'direct' | 'group' | 'channel';

export interface Chat {
  id: string;
  type: ChatType;
  participants: User[];
  title?: string; // Applicable for groups/channels
  avatarUrl?: string; // Applicable for groups/channels
  lastMessage?: Message;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CallStatus = 'initiating' | 'ringing' | 'connected' | 'ended' | 'missed' | 'rejected';
export type CallType = 'audio' | 'video';

export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  chatId: string;
  type: CallType;
  status: CallStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}
