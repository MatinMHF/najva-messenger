import React, { useEffect } from 'react';
import { useContactsStore } from '../../store/contactsStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';

export const ContactList: React.FC = () => {
  const { contacts, setContacts } = useContactsStore();
  const { user } = useAuthStore();

  useEffect(() => {
    const fetchContacts = async () => {
      if (!user) return;
      try {
        const res = await api.get('/contacts');
        setContacts(res.data);
      } catch (e) {
        console.error('Failed to fetch contacts', e);
      }
    };
    fetchContacts();
  }, [user, setContacts]);

  return (
    <div className="contact-list">
      {contacts.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No contacts added yet.</div>
      ) : (
        contacts.map(contact => (
          <div key={contact.id} className="chat-item">
            <div className="avatar">
              <img src={contact.avatarUrl || `https://ui-avatars.com/api/?name=${contact.displayName || contact.username}&background=1F8A96&color=fff`} alt={contact.displayName || contact.username} />
            </div>
            <div className="chat-item-details">
              <div className="chat-name">{contact.displayName || contact.username}</div>
              <div className="chat-item-last-message">{contact.status === 'ONLINE' ? 'Online' : 'Offline'}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
