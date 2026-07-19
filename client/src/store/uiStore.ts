import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getStoredTheme,
  setStoredTheme,
  getStoredLanguage,
  setStoredLanguage,
  type Theme,
  type Language,
} from '../lib/preferences';
import api from '../lib/api';
import { useAuthStore } from './authStore';

type ModalType = 'profile' | 'contacts' | 'settings' | 'logout' | 'edit-profile' | 'twofa' | 'new-group' | null;

interface UIState {
  theme: Theme;
  language: Language;
  isSidebarOpen: boolean;
  activeModal: ModalType;
  showUserDropdown: boolean;
  toggleTheme: () => void;
  setLanguage: (lang: Language) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setActiveModal: (modal: ModalType) => void;
  setShowUserDropdown: (val: boolean) => void;
}

/**
 * Best-effort sync of a signed-in user's preference to the server (User.theme /
 * User.language) so a fresh device inherits it after login. Logged-out users
 * only get the cookie/localStorage write above — the server call is skipped.
 */
function syncServerPreference(patch: Partial<{ theme: Theme; language: Language }>): void {
  if (!useAuthStore.getState().isAuthenticated) return;
  api.put('/users/settings', patch).catch(() => {
    // Non-fatal: the cookie/localStorage write already succeeded, so the
    // preference still applies locally even if the server sync fails.
  });
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: getStoredTheme() ?? 'dark',
      language: getStoredLanguage() ?? 'fa',
      isSidebarOpen: true,
      activeModal: null,
      showUserDropdown: false,
      toggleTheme: () =>
        set((state) => {
          const theme: Theme = state.theme === 'light' ? 'dark' : 'light';
          setStoredTheme(theme);
          syncServerPreference({ theme });
          return { theme };
        }),
      setLanguage: (language) => {
        setStoredLanguage(language);
        syncServerPreference({ language });
        set({ language });
      },
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      setActiveModal: (activeModal) => set({ activeModal }),
      setShowUserDropdown: (showUserDropdown) => set({ showUserDropdown }),
    }),
    {
      name: 'ui-settings',
      // Theme & language are owned by lib/preferences.ts (cookie-first, with its
      // own localStorage mirror) so they're intentionally excluded here — an
      // older persisted blob must never override the cookie-derived value above.
      partialize: (state) => ({ isSidebarOpen: state.isSidebarOpen }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<UIState>),
        theme: currentState.theme,
        language: currentState.language,
      }),
    }
  )
);
