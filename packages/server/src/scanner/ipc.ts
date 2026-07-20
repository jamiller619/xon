import type { ScanProgress, ScanSummary } from './orchestrator.ts'

export type ScanJobId = string

export type ParentToChild =
  | { type: 'start-scan'; jobId: ScanJobId; libraryId: string }
  | {
      type: 'refresh-metadata'
      jobId: ScanJobId
      libraryId: string
      mediaItemId?: string | undefined
    }
  | { type: 'shutdown' }

export type ChildToParent =
  | { type: 'ready' }
  | {
      type: 'progress'
      jobId: ScanJobId
      libraryId: string
      progress: ScanProgress
    }
  | {
      type: 'complete'
      jobId: ScanJobId
      libraryId: string
      summary: ScanSummary
    }
  | { type: 'error'; jobId: ScanJobId; libraryId: string; error: string }
  | { type: 'log'; line: string }
