import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const VIEW_MODE_STORAGE_KEY = 'xon:viewMode'

interface AppState {
  viewMode: 'grid' | 'list'
  setViewMode: (mode: 'grid' | 'list') => void
  isSelectMode: boolean
  setSelectMode: (mode: boolean) => void
  selectedItems: string[]
  setSelectedItems: (items: string[]) => void
  startSelection: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      viewMode: 'grid',
      setViewMode: (mode) => set({ viewMode: mode }),
      isSelectMode: false,
      setSelectMode: (mode) => set({ isSelectMode: mode }),
      selectedItems: [],
      setSelectedItems: (items) => set({ selectedItems: items }),
      startSelection: (id) => set({ isSelectMode: true, selectedItems: [id] }),
    }),
    {
      name: VIEW_MODE_STORAGE_KEY,
      partialize: (state) => ({ viewMode: state.viewMode }),
    },
  ),
)
