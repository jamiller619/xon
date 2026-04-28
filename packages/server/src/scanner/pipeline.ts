/**
 * @todo: This exists as a placeholder for the eventual
 * migration to the new pipeline for scanning. What's there
 * now is utter nonsense ai slop.
 */
// import type { LibSQLDatabase } from 'drizzle-orm/libsql'
// import type { Logger } from '../logger.js'

// export type PipelineContext = {
//   db: LibSQLDatabase
//   libraryId: string
//   dataDir: string
//   logger: Logger
// }

// export type MediaJob = {
//   id: string
//   type: 'new' | 'changed'
//   entry: ScanEntry

//   // mutable state through pipeline
//   mediaItemId?: string
//   metadata?: Record<string, unknown>
//   thumbnailPaths?: string[] | null
//   drmProtected?: boolean

//   errors: Error[]
// }

// export type PipelineStage = {
//   name: string
//   run(ctx: PipelineContext, job: MediaJob): Promise<void>
//   retry?: number
//   timeoutMs?: number
// }
