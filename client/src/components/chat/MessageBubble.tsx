import React from 'react';
import './MessageBubble.css';

interface MessageBubbleProps {
  text: string;
  time: string;
  isMine: boolean;
  delay?: number;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ text, time, isMine, delay = 0 }) => {
  return (
    <div 
      className={`message-wrapper d-flex mb-4 animate-slide-up ${isMine ? 'justify-content-end is-mine' : 'justify-content-start is-other'}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className={`message-bubble relative p-3 shadow-sm ${isMine ? 'bg-primary text-white' : 'bg-surface text-primary-text'}`}>
        <p className="m-0 text-sm mb-1">{text}</p>
        <span className={`text-xs block text-right ${isMine ? 'text-white opacity-75' : 'text-muted'}`}>
          {time}
        </span>
      </div>
    </div>
  );
};

export default MessageBubble;
