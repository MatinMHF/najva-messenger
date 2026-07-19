import { create } from 'zustand';

export interface Contact {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status?: string;
  lastSeen?: string;
  alias?: string;
}

interface ContactsState {
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
  addContact: (contact: Contact) => void;
  removeContact: (id: string) => void;
  isContact: (id: string) => boolean;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  setContacts: (contacts) => set({ contacts }),
  addContact: (contact) =>
    set((state) =>
      state.contacts.some((c) => c.id === contact.id)
        ? state
        : { contacts: [...state.contacts, contact] }
    ),
  removeContact: (id) =>
    set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) })),
  isContact: (id) => get().contacts.some((c) => c.id === id),
}));
