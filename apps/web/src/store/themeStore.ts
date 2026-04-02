import { create } from 'zustand'

const THEME_STORAGE_KEY = 'xon:activeTheme'

interface ThemeState {
  activeThemeId: string | null
  setActiveTheme: (id: string | null) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  activeThemeId: localStorage.getItem(THEME_STORAGE_KEY),
  setActiveTheme: (id) => {
    if (id === null) {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, id)
    }
    set({ activeThemeId: id })
  },
}))
