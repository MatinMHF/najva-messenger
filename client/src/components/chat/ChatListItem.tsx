import React from 'react';
import './ChatListItem.css';

interface ChatListItemProps {
  name: string;
  lastMessage: string;
  time: string;
  unread: number;
  avatar: string;
  isGroup?: boolean;
}

const ChatListItem: React.FC<ChatListItemProps> = ({ name, lastMessage, time, unread, avatar, isGroup }) => {
  return (
    <div className="chat-list-item d-flex align-items-center p-3 hover-bg-surface-hover cursor-pointer transition-colors relative">
      <div className="avatar-container relative mr-3 flex-shrink-0">
        <img src={avatar} alt={name} className="avatar-img rounded-full object-cover" />
        {isGroup && <div className="group-indicator absolute bottom-0 right-0 bg-primary rounded-full border border-surface"></div>}
      </div>
      
      <div className="chat-list-item-content flex-1 overflow-hidden">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h3 className="text-base font-semibold m-0 truncate text-primary-text">{name}</h3>
          <span className="text-xs text-muted whitespace-nowrap ml-2">{time}</span>
        </div>
        
        <div className="d-flex justify-content-between align-items-center">
          <p className="text-sm text-secondary m-0 truncate pr-2">{lastMessage}</p>
          {unread > 0 && (
            <div className="unread-badge bg-primary text-white text-xs font-bold rounded-full d-flex align-items-center justify-content-center">
              {unread}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatListItem;
