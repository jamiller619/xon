import { create } from 'zustand'
import type { ScanProgress, ScanSummary } from '~/lib/events'

/** How long a finished scan lingers in the banner before auto-dismissing. */
const DISMISS_AFTER_MS = 6000

export interface ScanEntry {
  libraryId: string
  status: 'running' | 'complete' | 'error'
  progress: ScanProgress | null
  summary: ScanSummary | null
  error: string | null
}

interface ScanStoreState {
  scans: Record<string, ScanEntry>
  applyProgress: (libraryId: string, progress: ScanProgress) => void
  applyComplete: (summary: ScanSummary) => void
  applyError: (libraryId: string, error: string) => void
  remove: (libraryId: string) => void
}

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useScanStore = create<ScanStoreState>((set, get) => {
  function scheduleDismiss(libraryId: string): void {
    const existing = dismissTimers.get(libraryId)
    if (existing) clearTimeout(existing)
    dismissTimers.set(
      libraryId,
      setTimeout(() => {
        dismissTimers.delete(libraryId)
        get().remove(libraryId)
      }, DISMISS_AFTER_MS),
    )
  }

  return {
    scans: {},

    applyProgress: (libraryId, progress) => {
      const timer = dismissTimers.get(libraryId)
      if (timer) {
        clearTimeout(timer)
        dismissTimers.delete(libraryId)
      }
      set((state) => ({
        scans: {
          ...state.scans,
          [libraryId]: {
            libraryId,
            status: 'running',
            progress,
            summary: null,
            error: null,
          },
        },
      }))
    },

    applyComplete: (summary) => {
      set((state) => ({
        scans: {
          ...state.scans,
          [summary.libraryId]: {
            libraryId: summary.libraryId,
            status: 'complete',
            progress: state.scans[summary.libraryId]?.progress ?? null,
            summary,
            error: null,
          },
        },
      }))
      scheduleDismiss(summary.libraryId)
    },

    applyError: (libraryId, error) => {
      set((state) => ({
        scans: {
          ...state.scans,
          [libraryId]: {
            libraryId,
            status: 'error',
            progress: state.scans[libraryId]?.progress ?? null,
            summary: null,
            error,
          },
        },
      }))
      scheduleDismiss(libraryId)
    },

    remove: (libraryId) =>
      set((state) => {
        const { [libraryId]: _removed, ...rest } = state.scans
        return { scans: rest }
      }),
  }
})
