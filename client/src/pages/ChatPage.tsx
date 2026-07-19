import React from 'react';
import ChatList from '../components/chat/ChatList';
import ChatView from '../components/chat/ChatView';
import ChatModals from '../components/chat/ChatModals';
import SlidingPanel from '../components/chat/SlidingPanel';
import '../styles/najva-chat.css';
import '../styles/najva-panel.css';
import '../styles/najva-overlays.css';

const ChatPage: React.FC = () => {
  return (
    <div className="najva-chat">
      <ChatList />
      <ChatView />
      <SlidingPanel />
      <ChatModals />
    </div>
  );
};

export default ChatPage;
