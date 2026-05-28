import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import { mediaItems } from '../../db/schema.ts'
import { createLogger } from '../../logger.ts'
import { getMediaProviderPlugin } from '../../plugins/mediaProviderPluginRegistry.ts'
import type { FileEntry } from '../fileEntry.ts'
import type { MediaJob } from '../pipeline.ts'
import {
  createMediaJob,
  type Discovery,
  type DiscoveryContext,
  type MediaDiscoverer,
} from './MediaDiscoverer.ts'

const logger = createLogger('plugin-discoverer')

export class PluginDiscoverer implements MediaDiscoverer {
  async discover(ctx: DiscoveryContext): Promise<Discovery | null> {
    const { db, libraryId, dataSource, extSet, mediaCategories } = ctx

    if (!dataSource.pluginId) {
      logger.warn(`Plugin data source missing pluginId: ${dataSource.path}`)
      return null
    }

    const plugin = getMediaProviderPlugin(dataSource.pluginId)
    if (!plugin) {
      logger.warn(`MediaProvider plugin not registered: ${dataSource.pluginId}`)
      return null
    }

    const listed = await plugin.listFiles(dataSource.path)
    const files = listed.filter((f) =>
      extSet.has(path.extname(f.name || f.path).toLowerCase()),
    )

    const filePaths = files.map((f) => f.path)
    const existing = filePaths.length
      ? await db
          .select({
            filePath: mediaItems.filePath,
            scannedAt: mediaItems.scannedAt,
          })
          .from(mediaItems)
          .where(
            and(
              eq(mediaItems.libraryId, libraryId),
              inArray(mediaItems.filePath, filePaths),
            ),
          )
      : []

    const existingByPath = new Map(
      existing.map((e) => [e.filePath, e.scannedAt]),
    )

    const jobs: MediaJob[] = []
    for (const f of files) {
      const ext = path.extname(f.name || f.path).toLowerCase()
      const file: FileEntry = {
        id: f.id,
        path: f.path,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        createdAt: f.createdAt,
        modifiedAt: f.modifiedAt,
        ext,
      }

      const prevScannedAt = existingByPath.get(f.path)
      const isNew = prevScannedAt === undefined

      if (
        !isNew &&
        f.modifiedAt &&
        prevScannedAt &&
        f.modifiedAt.getTime() <= prevScannedAt.getTime()
      ) {
        // Unchanged since last scan — skip.
        continue
      }

      jobs.push(createMediaJob(file, mediaCategories, isNew))
    }

    // Count removed: media items in DB for this library whose filePath starts
    // with the data source's root path but is not in the current listing.
    const listedSet = new Set(filePaths)
    const allForSource = await db
      .select({ filePath: mediaItems.filePath })
      .from(mediaItems)
      .where(eq(mediaItems.libraryId, libraryId))
    const removedCount = allForSource.filter(
      (m) =>
        m.filePath.startsWith(dataSource.path) && !listedSet.has(m.filePath),
    ).length

    return {
      jobs,
      removedCount,
      totalDiscovered: files.length,
      reconcile: () => {},
    }
  }
}
