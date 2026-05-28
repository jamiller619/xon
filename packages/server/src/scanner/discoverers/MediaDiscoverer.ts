import type { DataSource, MediaCategory } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { FileEntry } from '../fileEntry.ts'
import type { MediaJob } from '../pipeline.ts'

export type Discovery = {
  jobs: MediaJob[]
  removedCount: number
  totalDiscovered: number
  reconcile: () => void
}

export type DiscoveryContext = {
  db: LibSQLDatabase
  libraryId: string
  dataSource: DataSource
  extSet: Set<string>
  mediaCategories: MediaCategory[]
}

export interface MediaDiscoverer {
  discover(ctx: DiscoveryContext): Promise<Discovery | null>
}

export function createMediaJob(
  file: FileEntry,
  mediaCategories: MediaCategory[],
  isNew: boolean,
): MediaJob {
  return {
    type: isNew ? 'new' : 'changed',
    file,
    errors: [],
    mediaCategories,
    data: {
      metadata: {},
      ...(isNew ? { id: crypto.randomUUID() } : {}),
    },
  }
}
