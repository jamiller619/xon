import { createHash } from 'node:crypto'
import path from 'node:path'
import type { ContentType } from '@xon/shared'
import { and, eq } from 'drizzle-orm'
import { fdir } from 'fdir'
import fileEntryCache from 'file-entry-cache'
import pLimit from 'p-limit'
import config from '../../config.ts'
import { mediaItems } from '../../db/schema.ts'
import { createLogger } from '../../logger.ts'
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
const logger = createLogger('local-discoverer')
const MUSIC_ARTWORK_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
])
const MUSIC_PLAYLIST_EXTENSIONS = new Set(['.m3u', '.m3u8', '.pls'])
const MUSIC_ASSET_EXTENSIONS = new Set([
  ...MUSIC_ARTWORK_EXTENSIONS,
  ...MUSIC_PLAYLIST_EXTENSIONS,
])

export class LocalDiscoverer implements MediaDiscoverer {
  async discover(ctx: DiscoveryContext): Promise<Discovery> {
    const { libraryId, libraryPublicId, contentType, dataSource, extSet } = ctx
    const sourcePath = toLocalPath(dataSource.path)
    const discoveryStart = Date.now()

    const filterSamples = SAMPLE_FILTERED_LIBRARY_TYPES.has(contentType)

    const crawlStart = Date.now()
    const discoveredPaths = await new fdir()
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
          (extSet.has(path.extname(fp).toLowerCase()) ||
            (contentType === 'audio' &&
              MUSIC_ASSET_EXTENSIONS.has(path.extname(fp).toLowerCase()))) &&
          !(filterSamples && isSampleFile(fp)),
      )
      .crawl(sourcePath)
      .withPromise()
    const artworkPaths =
      contentType === 'audio'
        ? discoveredPaths.filter((filePath) =>
            MUSIC_ARTWORK_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
          )
        : []
    const playlistPaths =
      contentType === 'audio'
        ? discoveredPaths.filter((filePath) =>
            MUSIC_PLAYLIST_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
          )
        : []
    const filePaths = discoveredPaths.filter((filePath) => {
      const extension = path.extname(filePath).toLowerCase()
      return extSet.has(extension) && !MUSIC_ASSET_EXTENSIONS.has(extension)
    })

    logger.info('Local file crawl finished', {
      libraryId: libraryPublicId,
      dataSourceId: dataSource.id,
      durationMs: Date.now() - crawlStart,
      discoveredPaths: discoveredPaths.length,
      mediaFiles: filePaths.length,
      artworkFiles: artworkPaths.length,
      playlistFiles: playlistPaths.length,
    })

    const cacheKey = createHash('sha256')
      .update(`${libraryPublicId}:${dataSource.path}`)
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

    const cacheAnalysisStart = Date.now()
    const analyzed = cache.analyzeFiles(filePaths)
    logger.info('Local file cache analysis finished', {
      libraryId: libraryPublicId,
      dataSourceId: dataSource.id,
      durationMs: Date.now() - cacheAnalysisStart,
      changedFiles: analyzed.changedFiles.length,
      missingFiles: analyzed.notFoundFiles.length,
    })

    // The filesystem cache is only an optimization. A prior pipeline failure
    // can leave a file cached even though it was never persisted, so always
    // cross-check discovered paths against the database and retry missing rows.
    const existingRowsStart = Date.now()
    const existingRows = await ctx.db
      .select({ filePath: mediaItems.filePath })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.libraryId, libraryId),
          eq(mediaItems.dataSourceId, dataSource.id),
        ),
      )
    logger.info('Existing media lookup finished', {
      libraryId: libraryPublicId,
      dataSourceId: dataSource.id,
      durationMs: Date.now() - existingRowsStart,
      existingFiles: existingRows.length,
    })
    const existingPaths = new Set(existingRows.map((row) => row.filePath))
    const changedPaths = new Set(analyzed.changedFiles)
    const jobPaths = filePaths.filter((filePath) => {
      const storedPath = relativeMediaFilePath(filePath, dataSource)
      return changedPaths.has(filePath) || !existingPaths.has(storedPath)
    })

    const fileEntryStart = Date.now()
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
              libraryPublicId,
              contentType,
              dataSource.id,
              dataSource.path,
            )
          }),
        ),
      )
    ).filter((j): j is MediaJob => j != null)

    logger.info('Local discovery finished', {
      libraryId: libraryPublicId,
      dataSourceId: dataSource.id,
      durationMs: Date.now() - discoveryStart,
      fileEntryDurationMs: Date.now() - fileEntryStart,
      filesToProcess: jobs.length,
    })

    return {
      jobs,
      removedCount: analyzed.notFoundFiles.length,
      totalDiscovered: discoveredPaths.length,
      ...(contentType === 'audio'
        ? {
            musicFolderAssets: {
              artworkPaths,
              playlistPaths,
            },
          }
        : {}),
      reconcile: () => cache.reconcile(),
    }
  }
}

// "sample" is only a release-scene convention for movies/TV — the same
// word is legitimate in music (sample packs) and other library types
const SAMPLE_FILTERED_LIBRARY_TYPES = new Set<ContentType>([
  'video/movie',
  'video/tvshow',
])

const SAMPLE_TOKEN_PATTERN = /(^|[\s._-])sample([\s._-]|$)/i
const SAMPLE_DIR_PATTERN = /^samples?$/i

export function isSampleFile(filePath: string): boolean {
  const name = path.basename(filePath, path.extname(filePath))

  return SAMPLE_TOKEN_PATTERN.test(name)
}
