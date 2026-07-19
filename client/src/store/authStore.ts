import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  lastSeen?: string;
  status?: 'ONLINE' | 'OFFLINE' | 'AWAY';
  totpEnabled?: boolean;
  publicKey?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  recoveryCodes: string[] | null;
  setAuth: (user: User, token: string) => void;
  setRecoveryCodes: (codes: string[] | null) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      recoveryCodes: null,
      setAuth: (user, token) => set({ user, token, isAuthenticated: true, recoveryCodes: null }),
      setRecoveryCodes: (codes) => set({ recoveryCodes: codes }),
      updateUser: (patch) =>
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user })),
      logout: () => set({ user: null, token: null, isAuthenticated: false, recoveryCodes: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
);

export type { User };
