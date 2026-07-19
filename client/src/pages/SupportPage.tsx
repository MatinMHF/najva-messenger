import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { socketService } from '../lib/socket';
import { TopControls } from '../components/common/TopControls';

interface SupportMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

const SupportPage: React.FC = () => {
  const { language } = useUIStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [messages, setMessages] = useState<SupportMessage[]>([
    { id: 'welcome', text: t('support.welcome_message', 'Hello! How can we help you today?'), sender: 'agent', timestamp: new Date() }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const dir = language === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleSupportReply = (reply: any) => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: reply.text,
        sender: 'agent',
        timestamp: new Date()
      }]);
    };

    socketService.socket?.on('support_reply', handleSupportReply);
    
    return () => {
      socketService.socket?.off('support_reply', handleSupportReply);
    };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const userMsg: SupportMessage = {
      id: Date.now().toString(),
      text: newMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setNewMessage('');
    setIsTyping(true);

    // Send to socket
    socketService.socket?.emit('support_message', { text: userMsg.text });
    
    // Mock response for showcase
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: t('support.mock_reply', 'An agent will be with you shortly...'),
        sender: 'agent',
        timestamp: new Date()
      }]);
    }, 1500);
  };

  const handleBack = () => {
    if (isAuthenticated) {
      navigate('/chat');
    } else {
      navigate('/login');
    }
  };

  return (
    <>
      <div className="app-container" style={{ height: '100vh', flexDirection: 'column' }}>
        
        {/* Chat Header */}
        <header className="chat-header" style={{ padding: '0 1.5rem', background: 'var(--bg-surface)', direction: 'ltr' }}>
            
            {/* Left Content */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
                <button onClick={handleBack} className="icon-btn" aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                </button>
                <div>
                    <h3 id="support-title" style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)' }}>
                      {language === 'fa' ? 'پشتیبانی نجوا' : 'Najva Support'}
                    </h3>
                    <span id="support-subtitle" className="text-muted" style={{ fontSize: '0.8rem' }}>
                      {language === 'fa' ? 'پاسخگویی معمولاً در کمتر از ۱ ساعت' : 'Usually replies in under 1 hour'}
                    </span>
                </div>
            </div>

            {/* Controls (Right) */}
            <TopControls style={{ direction: 'ltr', position: 'static', margin: '0', marginLeft: 'auto' }} />

        </header>

        {/* Message Container */}
        <main className="messages-container" style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-page)' }}>
            {messages.map((msg, index) => (
              <div key={msg.id || index} className={`message ${msg.sender === 'user' ? 'me' : 'other'}`}>
                <div 
                  className="bubble"
                  style={{
                    backgroundColor: msg.sender === 'user' ? 'var(--bubble-me-bg)' : 'var(--bubble-other-bg)',
                    color: msg.sender === 'user' ? 'var(--bubble-me-text)' : 'var(--bubble-other-text)',
                    textAlign: language === 'fa' ? 'right' : 'left'
                  }}
                >
                  {msg.text}
                  <span className="msg-time" style={{ float: language === 'fa' ? 'left' : 'right', fontSize: '0.75rem', marginTop: '4px', marginLeft: language === 'fa' ? '0' : '8px', marginRight: language === 'fa' ? '8px' : '0', opacity: 0.6 }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="message other">
                <div className="bubble typing-indicator" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span className="dot" style={{ width: '8px', height: '8px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out both' }}></span>
                  <span className="dot" style={{ width: '8px', height: '8px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out both 0.2s' }}></span>
                  <span className="dot" style={{ width: '8px', height: '8px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out both 0.4s' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
        </main>

        {/* Input Footer */}
        <form onSubmit={handleSendMessage}>
          <footer className="chat-input-area" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-surface)', direction: 'ltr' }}>
              <div style={{ display: 'flex', gap: '1rem', width: '100%', alignItems: 'flex-end' }}>
                  <textarea 
                    id="msg-input" 
                    className="support-textarea" 
                    rows={1} 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={language === 'fa' ? 'پیام خود را بنویسید...' : 'Write your message...'}
                    style={{
                      flex: 1, padding: '0.85rem 1rem', borderRadius: '20px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.95rem', transition: 'all 0.3s ease', resize: 'none', height: 'auto', minHeight: '45px', maxHeight: '120px', lineHeight: '1.4',
                      textAlign: language === 'fa' ? 'right' : 'left',
                      direction: language === 'fa' ? 'rtl' : 'ltr'
                    }}
                  />
                  <button type="submit" className="send-btn" aria-label="Send Message" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                    </svg>
                  </button>
              </div>
          </footer>
        </form>

      </div>
    </>
  );
};

export default SupportPage;
