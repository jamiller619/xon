import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  username: string | null
  setAuth: (accessToken: string, username: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      username: null,
      setAuth: (accessToken, username) => set({ accessToken, username }),
      clearAuth: () => set({ accessToken: null, username: null }),
    }),
    {
      name: 'xon-auth',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
