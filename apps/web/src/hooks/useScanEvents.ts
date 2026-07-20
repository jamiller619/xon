import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscribeToEvents } from '~/lib/eventStream'
import { useScanStore } from '~/store/scanStore'

/**
 * Minimum gap between mid-scan refreshes of media queries — the scanner
 * persists items in batches, so the UI can fill in while a scan runs without
 * refetching on every progress tick.
 */
const REFRESH_THROTTLE_MS = 3000

/**
 * Opens the shared event-stream connection, routes scan lifecycle events into
 * the scan store, and refreshes media queries as scanned items land in the
 * database. Mount once near the app root (e.g. in the Layout).
 */
export function useScanEvents(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const { applyProgress, applyComplete, applyError } = useScanStore.getState()

    let lastRefresh = 0

    function refreshQueries(force: boolean): void {
      const now = Date.now()
      if (!force && now - lastRefresh < REFRESH_THROTTLE_MS) return
      lastRefresh = now
      queryClient.invalidateQueries({ queryKey: ['recentMedia'] })
      queryClient.invalidateQueries({ queryKey: ['featuredMedia'] })
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
    }

    return subscribeToEvents((event) => {
      switch (event.type) {
        case 'scan:progress': {
          const { libraryId, ...progress } = event.payload
          applyProgress(libraryId, progress)
          // No items are written during discovery; refresh only once the
          // scanner is actually persisting
          if (progress.phase !== 'discovering') refreshQueries(false)
          break
        }
        case 'scan:complete':
          applyComplete(event.payload)
          refreshQueries(true)
          break
        case 'scan:error':
          applyError(event.payload.libraryId, event.payload.error)
          // A failed scan may still have persisted partial results
          refreshQueries(true)
          break
      }
    })
  }, [queryClient])
}
