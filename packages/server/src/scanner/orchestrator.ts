import { basename, extname } from 'node:path'
import { filenameParse } from '@ctrl/video-filename-parser'
import type { MediaCategory } from '@xon/shared'
import { createLogger } from '../logger.js'

const logger = createLogger('orchestrator')
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  dataSources,
  libraries,
  matchingQueue,
  mediaItems,
} from '../db/schema.js'
import { emitEvent } from '../events.js'
import { autoTagMediaItems } from '../media/autoTag.js'
import { detectDrm } from '../media/drm.js'
import { extractExiftoolMetadata, isImageCategory } from '../media/exiftool.js'
import {
  extractFfprobeMetadata,
  isAudioVideoCategory,
} from '../media/ffprobe.js'
import {
  groupAudiobooks,
  groupMusicTracks,
  groupPhotos,
  groupTvEpisodes,
} from '../media/grouping.js'
import {
  extract3DModelMetadata,
  extractArchiveMetadata,
  extractDocumentMetadata,
  extractFontMetadata,
  is3DModelCategory,
  isArchiveCategory,
  isDocumentCategory,
  isFontCategory,
} from '../media/miscmeta.js'
import { extractMusicTags, isMusicCategory } from '../media/musictags.js'
import { generateThumbnails } from '../media/thumbnails.js'
import {
  generateVideoThumbnails,
  isVideoCategory,
} from '../media/videoThumbnails.js'
import { getAllMetadataSourcePlugins } from '../plugins/metadataSourcePluginRegistry.js'
import { emitPluginEvent } from '../plugins/pluginManager.js'
import { scanDataSource } from './scanner.js'

export type ScanProgress = {
  dataSourceId: string
  totalFiles: number
  processedFiles: number
  currentFile: string | null
}

export type ScanSummary = {
  libraryId: string
  newItems: number
  updatedItems: number
  removedItems: number
  totalDiscovered: number
}

async function tryQueueMatch(
  db: LibSQLDatabase,
  mediaItemId: string,
  fileName: string,
  mediaCategory: MediaCategory,
): Promise<void> {
  const nameWithoutExt = basename(fileName, extname(fileName))
  const plugins = getAllMetadataSourcePlugins()

  for (const plugin of plugins) {
    if (!plugin.supportedCategories.includes(mediaCategory)) continue
    try {
      const result = await plugin.match(nameWithoutExt, mediaCategory)
      if (!result) continue
      await db.insert(matchingQueue).values({
        id: crypto.randomUUID(),
        mediaItemId,
        suggestedTitle: result.suggestedTitle,
        suggestedMetadata: JSON.stringify(result.suggestedMetadata),
        confidence: result.confidence,
        matchSource: 'cloud',
      })
      logger.log(`Title matched (cloud): "${nameWithoutExt}"`, {
        suggestedTitle: result.suggestedTitle,
        confidence: result.confidence,
        plugin: plugin.manifest?.id ?? 'unknown',
      })
      // One match per item is sufficient
      return
    } catch (err) {
      logger.error(
        `Metadata match failed for "${nameWithoutExt}" (${plugin.manifest?.id ?? 'unknown'}): ${String(err)}`,
      )
    }
  }

  logger.debug(`No plugin match found for: "${nameWithoutExt}"`)
}

export async function scanLibrary(
  db: LibSQLDatabase,
  libraryId: string,
  onProgress?: (progress: ScanProgress) => void,
  dataDir?: string,
): Promise<ScanSummary> {
  const scanStart = Date.now()
  const resolvedDataDir = dataDir ?? process.env.DATA_DIR ?? './data'
  const libraryRows = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, libraryId))
  if (libraryRows.length === 0) {
    throw new Error(`Library not found: ${libraryId}`)
  }

  const libraryName = libraryRows[0]?.name ?? libraryId

  // Parse allowed media types — empty array means accept all
  let mediaTypes: string[] = []
  try {
    mediaTypes = libraryRows[0]?.mediaTypes ?? []
  } catch {
    mediaTypes = []
  }
  const hasTypeFilter = mediaTypes.length > 0

  const sources = await db
    .select()
    .from(dataSources)
    .where(eq(dataSources.libraryId, libraryId))
  // .where(
  //   and(eq(dataSources.libraryId, libraryId), eq(dataSources.enabled, true)),
  // )

  logger.log(`Scan started: "${libraryName}"`, {
    libraryId,
    sources: sources.length,
    typeFilter: hasTypeFilter ? mediaTypes : 'none',
  })

  let totalNew = 0
  let totalUpdated = 0
  let totalRemoved = 0
  let totalDiscovered = 0

  for (const source of sources) {
    const existing = await db
      .select({ filePath: mediaItems.filePath, fileSize: mediaItems.fileSize })
      .from(mediaItems)
      .where(eq(mediaItems.libraryId, source.libraryId))

    const result = await scanDataSource(source, existing)

    // Apply media type filter — changedFiles and newFiles only include matching types
    if (hasTypeFilter) {
      const beforeNew = result.newFiles.length
      const beforeChanged = result.changedFiles.length
      result.newFiles = result.newFiles.filter((e) =>
        mediaTypes.includes(e.mediaCategory),
      )
      result.changedFiles = result.changedFiles.filter((e) =>
        mediaTypes.includes(e.mediaCategory),
      )
      const filteredOut =
        beforeNew -
        result.newFiles.length +
        (beforeChanged - result.changedFiles.length)
      if (filteredOut > 0) {
        logger.log(
          `Type filter excluded ${filteredOut} file(s) not matching: ${mediaTypes.join(', ')}`,
        )
      }
    }

    totalDiscovered += result.discovered.length

    const progress: ScanProgress = {
      dataSourceId: source.id,
      totalFiles: result.discovered.length,
      processedFiles: 0,
      currentFile: null,
    }

    const now = new Date()

    for (const entry of result.newFiles) {
      progress.currentFile = entry.filePath
      onProgress?.(progress)

      logger.log(`Processing new file: ${entry.filePath}`, {
        category: entry.mediaCategory,
        size: entry.fileSize,
      })

      let metadata = '{}'
      if (isMusicCategory(entry.mediaCategory)) {
        const musicMeta = await extractMusicTags(entry.filePath)
        if (musicMeta) {
          metadata = JSON.stringify(musicMeta)
        }
      } else if (isAudioVideoCategory(entry.mediaCategory)) {
        const ffMeta = await extractFfprobeMetadata(entry.filePath)
        if (ffMeta) {
          metadata = JSON.stringify(ffMeta)
        }
      } else if (isImageCategory(entry.mediaCategory)) {
        const exifMeta = await extractExiftoolMetadata(entry.filePath)
        if (exifMeta) {
          metadata = JSON.stringify(exifMeta)
        }
      } else if (isDocumentCategory(entry.mediaCategory)) {
        const docMeta = await extractDocumentMetadata(entry.filePath)
        if (docMeta) {
          metadata = JSON.stringify(docMeta)
        }
      } else if (isFontCategory(entry.mediaCategory)) {
        const fontMeta = await extractFontMetadata(entry.filePath)
        if (fontMeta) {
          metadata = JSON.stringify(fontMeta)
        }
      } else if (is3DModelCategory(entry.mediaCategory)) {
        const modelMeta = await extract3DModelMetadata(entry.filePath)
        if (modelMeta) {
          metadata = JSON.stringify(modelMeta)
        }
      } else if (isArchiveCategory(entry.mediaCategory)) {
        const archiveMeta = await extractArchiveMetadata(entry.filePath)
        if (archiveMeta) {
          metadata = JSON.stringify(archiveMeta)
        }
      }

      const id = crypto.randomUUID()
      const drmProtected = await detectDrm(entry.filePath)
      if (drmProtected) {
        logger.warn(`DRM detected: ${entry.filePath}`)
      }

      let thumbnailPaths: string | null = null
      if (isImageCategory(entry.mediaCategory)) {
        const thumbs = await generateThumbnails(
          entry.filePath,
          id,
          resolvedDataDir,
        )
        if (thumbs) {
          thumbnailPaths = JSON.stringify(thumbs)
        } else {
          logger.warn(`Thumbnail generation failed: ${entry.filePath}`)
        }
      } else if (isVideoCategory(entry.mediaCategory)) {
        const thumbs = await generateVideoThumbnails(
          entry.filePath,
          id,
          resolvedDataDir,
        )
        if (thumbs) {
          thumbnailPaths = JSON.stringify(thumbs)
        } else {
          logger.warn(`Video thumbnail generation failed: ${entry.filePath}`)
        }
      }

      const parsedTitle = filenameParse(entry.fileName).title || null

      await db.insert(mediaItems).values({
        id,
        libraryId,
        filePath: entry.filePath,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
        mimeType: entry.mimeType ?? null,
        mediaCategory: entry.mediaCategory,
        title: parsedTitle,
        metadata,
        // thumbnailPaths,
        drmProtected,
        createdAt: now,
        updatedAt: now,
        scannedAt: now,
      })

      emitEvent({
        type: 'media:added',
        payload: { libraryId, mediaItemId: id },
      })
      emitPluginEvent('media:created', {
        mediaId: id,
        filePath: entry.filePath,
        mediaCategory: entry.mediaCategory as MediaCategory,
        libraryId,
      })
      await tryQueueMatch(
        db,
        id,
        entry.fileName,
        entry.mediaCategory as MediaCategory,
      )
      progress.processedFiles++
      totalNew++
    }

    for (const entry of result.changedFiles) {
      progress.currentFile = entry.filePath
      onProgress?.(progress)

      logger.log(`Processing changed file: ${entry.filePath}`, {
        category: entry.mediaCategory,
      })

      const existingRows = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.libraryId, source.libraryId),
            eq(mediaItems.filePath, entry.filePath),
          ),
        )
      const existingId = existingRows[0]?.id ?? crypto.randomUUID()

      const drmProtectedUpdate = await detectDrm(entry.filePath)
      const updateFields: Record<string, unknown> = {
        fileSize: entry.fileSize,
        mimeType: entry.mimeType ?? null,
        mediaCategory: entry.mediaCategory,
        drmProtected: drmProtectedUpdate,
        updatedAt: now,
        scannedAt: now,
      }

      if (isMusicCategory(entry.mediaCategory)) {
        const musicMeta = await extractMusicTags(entry.filePath)
        if (musicMeta) {
          updateFields.metadata = JSON.stringify(musicMeta)
        }
      } else if (isAudioVideoCategory(entry.mediaCategory)) {
        const ffMeta = await extractFfprobeMetadata(entry.filePath)
        if (ffMeta) {
          updateFields.metadata = JSON.stringify(ffMeta)
        }
      } else if (isImageCategory(entry.mediaCategory)) {
        const exifMeta = await extractExiftoolMetadata(entry.filePath)
        if (exifMeta) {
          updateFields.metadata = JSON.stringify(exifMeta)
        }
        const thumbs = await generateThumbnails(
          entry.filePath,
          existingId,
          resolvedDataDir,
        )
        if (thumbs) {
          updateFields.thumbnailPaths = JSON.stringify(thumbs)
        } else {
          logger.warn(`Thumbnail generation failed: ${entry.filePath}`)
        }
      } else if (isVideoCategory(entry.mediaCategory)) {
        const thumbs = await generateVideoThumbnails(
          entry.filePath,
          existingId,
          resolvedDataDir,
        )
        if (thumbs) {
          updateFields.thumbnailPaths = JSON.stringify(thumbs)
        } else {
          logger.warn(`Video thumbnail generation failed: ${entry.filePath}`)
        }
      } else if (isDocumentCategory(entry.mediaCategory)) {
        const docMeta = await extractDocumentMetadata(entry.filePath)
        if (docMeta) {
          updateFields.metadata = JSON.stringify(docMeta)
        }
      } else if (isFontCategory(entry.mediaCategory)) {
        const fontMeta = await extractFontMetadata(entry.filePath)
        if (fontMeta) {
          updateFields.metadata = JSON.stringify(fontMeta)
        }
      } else if (is3DModelCategory(entry.mediaCategory)) {
        const modelMeta = await extract3DModelMetadata(entry.filePath)
        if (modelMeta) {
          updateFields.metadata = JSON.stringify(modelMeta)
        }
      } else if (isArchiveCategory(entry.mediaCategory)) {
        const archiveMeta = await extractArchiveMetadata(entry.filePath)
        if (archiveMeta) {
          updateFields.metadata = JSON.stringify(archiveMeta)
        }
      }

      await db
        .update(mediaItems)
        .set(updateFields)
        .where(
          and(
            eq(mediaItems.libraryId, source.libraryId),
            eq(mediaItems.filePath, entry.filePath),
          ),
        )

      emitPluginEvent('media:updated', {
        mediaId: existingId,
        filePath: entry.filePath,
        mediaCategory: entry.mediaCategory as MediaCategory,
        libraryId,
      })
      progress.processedFiles++
      totalUpdated++
    }

    if (result.removedFilePaths.length > 0) {
      logger.log(`Removing ${result.removedFilePaths.length} deleted file(s)`)
      const removedRows = await db
        .select({
          id: mediaItems.id,
          filePath: mediaItems.filePath,
          mediaCategory: mediaItems.mediaCategory,
        })
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.libraryId, source.libraryId),
            inArray(mediaItems.filePath, result.removedFilePaths),
          ),
        )
      await db
        .delete(mediaItems)
        .where(
          and(
            eq(mediaItems.libraryId, source.libraryId),
            inArray(mediaItems.filePath, result.removedFilePaths),
          ),
        )
      for (const row of removedRows) {
        emitEvent({
          type: 'media:removed',
          payload: { libraryId, mediaItemId: row.id },
        })
        emitPluginEvent('media:deleted', {
          mediaId: row.id,
          filePath: row.filePath,
          mediaCategory: row.mediaCategory as MediaCategory,
          libraryId,
        })
      }
      totalRemoved += result.removedFilePaths.length
    }
  }

  // Backfill thumbnails for video/image items that were scanned before
  // thumbnail generation was implemented (thumbnailPaths IS NULL).
  // const missingThumbs = await db
  //   .select({
  //     id: mediaItems.id,
  //     filePath: mediaItems.filePath,
  //     mediaCategory: mediaItems.mediaCategory,
  //   })
  //   .from(mediaItems)
  //   .where(
  //     and(
  //       eq(mediaItems.libraryId, libraryId),
  //       isNull(mediaItems.thumbnailPaths),
  //     ),
  //   )

  // if (missingThumbs.length > 0) {
  //   logger.log(`Backfilling thumbnails for ${missingThumbs.length} item(s)`)
  //   let backfilled = 0
  //   for (const item of missingThumbs) {
  //     let thumbs = null
  //     if (isVideoCategory(item.mediaCategory)) {
  //       thumbs = await generateVideoThumbnails(
  //         item.filePath,
  //         item.id,
  //         resolvedDataDir,
  //       )
  //     } else if (isImageCategory(item.mediaCategory)) {
  //       thumbs = await generateThumbnails(
  //         item.filePath,
  //         item.id,
  //         resolvedDataDir,
  //       )
  //     }
  //     if (thumbs) {
  //       await db
  //         .update(mediaItems)
  //         .set({
  //           thumbnailPaths: JSON.stringify(thumbs),
  //           updatedAt: new Date(),
  //         })
  //         .where(eq(mediaItems.id, item.id))
  //       backfilled++
  //     } else if (
  //       isVideoCategory(item.mediaCategory) ||
  //       isImageCategory(item.mediaCategory)
  //     ) {
  //       logger.warn(`Backfill thumbnail failed: ${item.filePath}`)
  //     }
  //   }
  //   logger.log(
  //     `Thumbnail backfill complete: ${backfilled}/${missingThumbs.length} succeeded`,
  //   )
  // }

  logger.log('Running post-scan grouping')
  await groupTvEpisodes(db, libraryId)
  await groupMusicTracks(db, libraryId)
  await groupAudiobooks(db, libraryId)
  await groupPhotos(db, libraryId)
  logger.log('Running auto-tagging')
  await autoTagMediaItems(db, libraryId)

  const duration = Date.now() - scanStart
  logger.log(`Scan complete: "${libraryName}"`, {
    durationMs: duration,
    discovered: totalDiscovered,
    new: totalNew,
    updated: totalUpdated,
    removed: totalRemoved,
  })

  return {
    libraryId,
    newItems: totalNew,
    updatedItems: totalUpdated,
    removedItems: totalRemoved,
    totalDiscovered,
  }
}
