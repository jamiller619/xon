import { create } from 'zustand'

const VIEW_MODE_STORAGE_KEY = 'xon:viewMode'

interface AppState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  viewMode: 'grid' | 'list'
  setViewMode: (mode: 'grid' | 'list') => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  viewMode:
    (localStorage.getItem(VIEW_MODE_STORAGE_KEY) as 'grid' | 'list' | null) ??
    'grid',
  setViewMode: (mode) => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    set({ viewMode: mode })
  },
}))
