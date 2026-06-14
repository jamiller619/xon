/**
 * Mirror of the server's `XonEvent` payloads that the web app consumes over the
 * `/api/ws` WebSocket. Kept intentionally minimal — only the events the UI acts
 * on are typed precisely; everything else falls through the generic member.
 */

export type ScanPhase = 'discovering' | 'processing' | 'done'

export interface ScanProgress {
  dataSourceId: string
  phase: ScanPhase
  /** Total files found on disk for this data source. */
  discoveredFiles: number
  /** Files needing processing (new or changed). */
  totalFiles: number
  processedFiles: number
  currentFile: string | null
  message: string
}

export interface ScanSummary {
  libraryId: string
  newItems: number
  updatedItems: number
  removedItems: number
  totalDiscovered: number
}

/** A single parsed JSONL log entry as emitted by the server logger. */
export interface LogEntry {
  ts?: string
  level?: 'debug' | 'info' | 'warn' | 'error'
  pid?: number
  host?: string
  service?: string
  component?: string
  msg?: string
  [key: string]: unknown
}

export type ScanProgressEvent = {
  type: 'scan:progress'
  payload: { libraryId: string } & ScanProgress
}

export type ScanCompleteEvent = {
  type: 'scan:complete'
  payload: ScanSummary
}

export type ScanErrorEvent = {
  type: 'scan:error'
  payload: { libraryId: string; error: string }
}

export type LogLineEvent = {
  type: 'log:line'
  payload: LogEntry
}

// Only the events the UI acts on are modeled. The server emits others
// (media:added, backup:*, …); they arrive over the same socket and are simply
// ignored by the `default`/no-match branches of consumers.
export type XonEvent =
  | ScanProgressEvent
  | ScanCompleteEvent
  | ScanErrorEvent
  | LogLineEvent
