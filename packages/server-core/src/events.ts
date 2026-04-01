import { EventEmitter } from 'node:events'

export type XonEvent =
  | {
      type: 'scan:progress'
      payload: {
        libraryId: string
        fileCount: number
        currentFile: string | null
        percentComplete: number
      }
    }
  | {
      type: 'scan:complete'
      payload: {
        libraryId: string
        newItems: number
        updatedItems: number
        removedItems: number
        totalDiscovered: number
      }
    }
  | { type: 'scan:error'; payload: { libraryId: string; error: string } }
  | { type: 'media:added'; payload: { libraryId: string; mediaItemId: string } }
  | {
      type: 'media:removed'
      payload: { libraryId: string; mediaItemId: string }
    }
  | { type: 'backup:progress'; payload: { stage: string; percent: number } }
  | { type: 'backup:complete'; payload: { sizeBytes: number } }
  | { type: 'backup:error'; payload: { error: string } }
  | { type: 'restore:progress'; payload: { stage: string; percent: number } }
  | { type: 'restore:complete'; payload: { restoredAt: string } }
  | { type: 'restore:error'; payload: { error: string } }
  | {
      type: 'backup:media:progress'
      payload: {
        jobId: string
        copied: number
        total: number
        currentFile: string
      }
    }
  | {
      type: 'backup:media:complete'
      payload: { jobId: string; copied: number; errors: number }
    }
  | { type: 'backup:media:error'; payload: { jobId: string; error: string } }
  | {
      type: 'backup:verify:progress'
      payload: {
        jobId: string
        checked: number
        total: number
        currentFile: string
      }
    }
  | {
      type: 'backup:verify:complete'
      payload: {
        jobId: string
        passed: number
        failed: number
        missing: number
      }
    }
  | { type: 'backup:verify:error'; payload: { jobId: string; error: string } }

export const eventBus = new EventEmitter()

export function emitEvent(event: XonEvent): void {
  eventBus.emit('event', event)
}
