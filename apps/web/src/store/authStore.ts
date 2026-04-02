import { create } from 'zustand'

interface AuthState {
  accessToken: string | null
  username: string | null
  role: string | null
  setAuth: (accessToken: string, username: string, role: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  username: null,
  role: null,
  setAuth: (accessToken, username, role) =>
    set({ accessToken, username, role }),
  clearAuth: () => set({ accessToken: null, username: null, role: null }),
}))
