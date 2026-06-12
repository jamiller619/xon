import { createHash } from 'node:crypto'
import path from 'node:path'
import { fdir } from 'fdir'
import fileEntryCache from 'file-entry-cache'
import pLimit from 'p-limit'
import config from '../../config.ts'
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
    const { libraryId, dataSource, extSet } = ctx
    const sourcePath = toLocalPath(dataSource.path)

    const filePaths = await new fdir()
      .withFullPaths()
      .filter(
        (fp, isDir) => !isDir && extSet.has(path.extname(fp).toLowerCase()),
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

    const previouslySeen = new Set(cache.cache.keys())
    const analyzed = cache.analyzeFiles(filePaths)

    const limit = pLimit(FILE_ENTRY_CONCURRENCY)
    const jobs = (
      await Promise.all(
        analyzed.changedFiles.map((filePath) =>
          limit(async (): Promise<MediaJob | null> => {
            const file = await createFileEntry(filePath)

            if (!file) return null

            const isNew = !previouslySeen.has(filePath)

            return createMediaJob(ctx.db, file, isNew)
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
