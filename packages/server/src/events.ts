import { EventEmitter } from 'node:events'

export type ScanProgressEvent = {
  type: 'scan:progress'
  payload: {
    libraryId: string
    fileCount: number
    currentFile: string | null
    percentComplete: number
  }
}

export type ScanCompleteEvent = {
  type: 'scan:complete'
  payload: {
    libraryId: string
    newItems: number
    updatedItems: number
    removedItems: number
    totalDiscovered: number
  }
}

export type ScanErrorEvent = {
  type: 'scan:error'
  payload: { libraryId: string; error: string }
}

export type MediaAddedEvent = {
  type: 'media:added'
  payload: { libraryId: string; mediaItemId: string }
}

export type MediaRemovedEvent = {
  type: 'media:removed'
  payload: { libraryId: string; mediaItemId: string }
}

export type BackupProgressEvent = {
  type: 'backup:progress'
  payload: { stage: string; percent: number }
}

export type BackupCompleteEvent = {
  type: 'backup:complete'
  payload: { sizeBytes: number }
}

export type BackupErrorEvent = {
  type: 'backup:error'
  payload: { error: string }
}

export type RestoreProgressEvent = {
  type: 'restore:progress'
  payload: { stage: string; percent: number }
}

export type RestoreCompleteEvent = {
  type: 'restore:complete'
  payload: { restoredAt: string }
}

export type RestoreErrorEvent = {
  type: 'restore:error'
  payload: { error: string }
}

export type BackupMediaProgressEvent = {
  type: 'backup:media:progress'
  payload: {
    jobId: string
    copied: number
    total: number
    currentFile: string
  }
}

export type BackupMediaCompleteEvent = {
  type: 'backup:media:complete'
  payload: { jobId: string; copied: number; errors: number }
}

export type BackupMediaErrorEvent = {
  type: 'backup:media:error'
  payload: { jobId: string; error: string }
}

export type BackupVerifyProgressEvent = {
  type: 'backup:verify:progress'
  payload: {
    jobId: string
    checked: number
    total: number
    currentFile: string
  }
}

export type BackupVerifyCompleteEvent = {
  type: 'backup:verify:complete'
  payload: {
    jobId: string
    passed: number
    failed: number
    missing: number
  }
}

export type BackupVerifyErrorEvent = {
  type: 'backup:verify:error'
  payload: { jobId: string; error: string }
}

export type XonEvent =
  | ScanProgressEvent
  | ScanCompleteEvent
  | ScanErrorEvent
  | MediaAddedEvent
  | MediaRemovedEvent
  | BackupProgressEvent
  | BackupCompleteEvent
  | BackupErrorEvent
  | RestoreProgressEvent
  | RestoreCompleteEvent
  | RestoreErrorEvent
  | BackupMediaProgressEvent
  | BackupMediaCompleteEvent
  | BackupMediaErrorEvent
  | BackupVerifyProgressEvent
  | BackupVerifyCompleteEvent
  | BackupVerifyErrorEvent

export const eventBus = new EventEmitter()

export function emitEvent(event: XonEvent): void {
  eventBus.emit('event', event)
}
