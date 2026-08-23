import type { ContentType, DataSource } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { generatePublicId } from '../../lib/publicId.ts'
import * as mediaService from '../../services/mediaService.ts'
import type { FileEntry } from '../fileEntry.ts'
import type { MediaJob } from '../pipeline.ts'

export type Discovery = {
  jobs: MediaJob[]
  removedCount: number
  totalDiscovered: number
  musicFolderAssets?: {
    artworkPaths: string[]
    playlistPaths: string[]
  }
  reconcile: () => void
}

export type DiscoveryContext = {
  db: LibSQLDatabase
  libraryId: number
  libraryPublicId: string
  dataSource: DataSource
  extSet: Set<string>
  contentType: ContentType
}

export interface MediaDiscoverer {
  discover(ctx: DiscoveryContext): Promise<Discovery | null>
}

export async function createMediaJob(
  db: LibSQLDatabase,
  file: FileEntry,
  isNew: boolean,
  libraryId: number,
  libraryPublicId: string,
  contentType: ContentType,
  dataSourceId: string,
  dataSourcePath: string,
): Promise<MediaJob> {
  const job: MediaJob = {
    id: crypto.randomUUID(),
    type: isNew ? 'new' : 'changed',
    file,
    errors: [],
    libraryId,
    libraryPublicId,
    contentType,
    dataSourcePath,
    dataSourceId,
    mediaTypes: [], // This will be filled in later based on the file extension
    data: {
      publicId: generatePublicId(),
      metadata: {},
    },
  }

  if (isNew) {
    return job
  }

  const data =
    (await mediaService.getMediaBySourcePath(
      db,
      file.path,
      dataSourceId,
      dataSourcePath,
    )) ?? {}

  return {
    ...job,
    data: {
      ...job.data,
      ...data,
    },
  }
}
