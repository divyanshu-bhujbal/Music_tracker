import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  setAuthenticated: (auth: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: true,
  setAuthenticated: (isAuthenticated: boolean) => {
    // eslint-disable-next-line no-console
    console.debug(`useAuthStore: isAuthenticated changed to ${isAuthenticated}`);
    set({ isAuthenticated });
  },
}));
