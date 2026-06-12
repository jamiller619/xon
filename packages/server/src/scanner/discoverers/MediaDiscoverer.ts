import type { DataSource, LibraryType } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as mediaService from '../../services/mediaService.ts'
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
  libraryType: LibraryType
}

export interface MediaDiscoverer {
  discover(ctx: DiscoveryContext): Promise<Discovery | null>
}

export async function createMediaJob(
  db: LibSQLDatabase,
  file: FileEntry,
  isNew: boolean,
): Promise<MediaJob> {
  const result: MediaJob = {
    id: crypto.randomUUID(),
    type: isNew ? 'new' : 'changed',
    file,
    errors: [],
    mediaTypes: [], // This will be filled in later based on the file extension
    data: {
      metadata: {},
    },
  }

  if (isNew) {
    return result
  }

  const data = (await mediaService.getMediaByPath(db, file.path)) ?? {}

  return {
    ...result,
    data: {
      ...result.data,
      ...data,
    },
  }
}
