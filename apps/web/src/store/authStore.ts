import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  username: string | null
  role: string | null
  setAuth: (accessToken: string, username: string, role: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      username: null,
      role: null,
      setAuth: (accessToken, username, role) =>
        set({ accessToken, username, role }),
      clearAuth: () => set({ accessToken: null, username: null, role: null }),
    }),
    {
      name: 'xon-auth',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
