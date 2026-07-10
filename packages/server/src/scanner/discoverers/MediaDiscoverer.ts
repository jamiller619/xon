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
  libraryId: string,
  libraryType: LibraryType,
  dataSourcePath: string,
): Promise<MediaJob> {
  const job: MediaJob = {
    id: crypto.randomUUID(),
    type: isNew ? 'new' : 'changed',
    file,
    errors: [],
    libraryId,
    libraryType,
    dataSourcePath,
    mediaTypes: [], // This will be filled in later based on the file extension
    data: {
      id: crypto.randomUUID(),
      metadata: {},
    },
  }

  if (isNew) {
    return job
  }

  const data =
    (await mediaService.getMediaByPathAndLibrary(db, file.path, libraryId)) ??
    {}

  return {
    ...job,
    data: {
      ...job.data,
      ...data,
    },
  }
}
