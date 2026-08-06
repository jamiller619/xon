import { createHash } from 'node:crypto'
import path from 'node:path'
import { LibraryType } from '@xon/shared'
import { and, eq } from 'drizzle-orm'
import { fdir } from 'fdir'
import fileEntryCache from 'file-entry-cache'
import pLimit from 'p-limit'
import config from '../../config.ts'
import { mediaItems } from '../../db/schema.ts'
import { relativeMediaFilePath } from '../../media/mediaFilePaths.ts'
import { createFileEntry } from '../fileEntry.ts'
import type { MediaJob } from '../pipeline.ts'
import { toLocalPath } from '../scanner.ts'
import {
  createMediaJob,
  type Discovery,
  type DiscoveryContext,
  type MediaDiscoverer,
} from './MediaDiscoverer.ts'

const FILE_ENTRY_CONCURRENCY = 32

export class LocalDiscoverer implements MediaDiscoverer {
  async discover(ctx: DiscoveryContext): Promise<Discovery> {
    const { libraryId, libraryType, dataSource, extSet } = ctx
    const sourcePath = toLocalPath(dataSource.path)

    const filterSamples = SAMPLE_FILTERED_LIBRARY_TYPES.has(libraryType)

    const filePaths = await new fdir()
      .withFullPaths()
      .exclude(
        (dirName) =>
          dirName.startsWith('.') ||
          (filterSamples && SAMPLE_DIR_PATTERN.test(dirName)),
      )
      .filter(
        (fp, isDir) =>
          !isDir &&
          !fp.startsWith('.') &&
          !path.basename(fp).startsWith('.') &&
          extSet.has(path.extname(fp).toLowerCase()) &&
          !(filterSamples && isSampleFile(fp)),
      )
      .crawl(sourcePath)
      .withPromise()

    const cacheKey = createHash('sha256')
      .update(`${libraryId}:${dataSource.path}`)
      .digest('hex')
      .slice(0, 16)

    const cache = fileEntryCache.create(
      `filescanner-${cacheKey}`,
      config.get('appdata.cachePath'),
      {
        useAbsolutePathAsKey: true,
        restrictAccessToCwd: false,
        useCheckSum: false,
      },
    )

    const analyzed = cache.analyzeFiles(filePaths)

    // The filesystem cache is only an optimization. A prior pipeline failure
    // can leave a file cached even though it was never persisted, so always
    // cross-check discovered paths against the database and retry missing rows.
    const existingRows = await ctx.db
      .select({ filePath: mediaItems.filePath })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.libraryId, libraryId),
          eq(mediaItems.dataSourceId, dataSource.id),
        ),
      )
    const existingPaths = new Set(existingRows.map((row) => row.filePath))
    const changedPaths = new Set(analyzed.changedFiles)
    const jobPaths = filePaths.filter((filePath) => {
      const storedPath = relativeMediaFilePath(filePath, dataSource)
      return changedPaths.has(filePath) || !existingPaths.has(storedPath)
    })

    const limit = pLimit(FILE_ENTRY_CONCURRENCY)
    const jobs = (
      await Promise.all(
        jobPaths.map((filePath) =>
          limit(async (): Promise<MediaJob | null> => {
            const file = await createFileEntry(filePath)

            if (!file) return null

            const storedPath = relativeMediaFilePath(filePath, dataSource)
            const isNew = !existingPaths.has(storedPath)

            return createMediaJob(
              ctx.db,
              file,
              isNew,
              libraryId,
              libraryType,
              dataSource.id,
              dataSource.path,
            )
          }),
        ),
      )
    ).filter((j): j is MediaJob => j != null)

    return {
      jobs,
      removedCount: analyzed.notFoundFiles.length,
      totalDiscovered: filePaths.length,
      reconcile: () => cache.reconcile(),
    }
  }
}

// "sample" is only a release-scene convention for movies/TV — the same
// word is legitimate in music (sample packs) and other library types
const SAMPLE_FILTERED_LIBRARY_TYPES = new Set<LibraryType>([
  LibraryType.Movies,
  LibraryType.TVShows,
])

const SAMPLE_TOKEN_PATTERN = /(^|[\s._-])sample([\s._-]|$)/i
const SAMPLE_DIR_PATTERN = /^samples?$/i

export function isSampleFile(filePath: string): boolean {
  const name = path.basename(filePath, path.extname(filePath))

  return SAMPLE_TOKEN_PATTERN.test(name)
}
