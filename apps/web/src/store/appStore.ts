import { create } from 'zustand'

const VIEW_MODE_STORAGE_KEY = 'xon:viewMode'

interface AppState {
  viewMode: 'grid' | 'list'
  setViewMode: (mode: 'grid' | 'list') => void
}

export const useAppStore = create<AppState>((set) => ({
  viewMode:
    (localStorage.getItem(VIEW_MODE_STORAGE_KEY) as 'grid' | 'list' | null) ??
    'grid',
  setViewMode: (mode) => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    set({ viewMode: mode })
  },
}))
