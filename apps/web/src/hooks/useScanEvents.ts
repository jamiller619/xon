import { useEffect } from 'react'
import { subscribeToEvents } from '~/lib/eventStream'
import { useScanStore } from '~/store/scanStore'

/**
 * Opens the shared event-stream connection and routes scan lifecycle events
 * into the scan store. Mount once near the app root (e.g. in the Layout).
 */
export function useScanEvents(): void {
  useEffect(() => {
    const { applyProgress, applyComplete, applyError } = useScanStore.getState()

    return subscribeToEvents((event) => {
      switch (event.type) {
        case 'scan:progress': {
          const { libraryId, ...progress } = event.payload
          applyProgress(libraryId, progress)
          break
        }
        case 'scan:complete':
          applyComplete(event.payload)
          break
        case 'scan:error':
          applyError(event.payload.libraryId, event.payload.error)
          break
      }
    })
  }, [])
}
