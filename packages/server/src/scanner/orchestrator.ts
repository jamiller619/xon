import { basename, extname } from 'node:path'
import { filenameParse } from '@ctrl/video-filename-parser'
import type { MediaCategory } from '@xon/shared'
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
      // One match per item is sufficient
      return
    } catch (err) {
      console.error(
        `Metadata match failed for "${nameWithoutExt}" (${plugin.manifest?.id ?? 'unknown'}): ${String(err)}`,
      )
    }
  }

  // No plugin matched — fall back to local filename parsing so the item still
  // gets a suggested title the user can review or correct.
  const parsed = filenameParse(fileName)
  if (!parsed.title) return

  const suggestedMetadata: Record<string, unknown> = {}
  if (parsed.year) suggestedMetadata.year = Number.parseInt(parsed.year, 10)
  if (parsed.resolution) suggestedMetadata.resolution = parsed.resolution
  if (parsed.sources?.length) suggestedMetadata.sources = parsed.sources
  if (parsed.videoCodec) suggestedMetadata.videoCodec = parsed.videoCodec
  if (parsed.edition && Object.keys(parsed.edition).length > 0) {
    suggestedMetadata.edition = parsed.edition
  }

  await db.insert(matchingQueue).values({
    id: crypto.randomUUID(),
    mediaItemId,
    suggestedTitle: parsed.title,
    suggestedMetadata: JSON.stringify(suggestedMetadata),
    confidence: 60,
    matchSource: 'local',
  })
}

export async function scanLibrary(
  db: LibSQLDatabase,
  libraryId: string,
  onProgress?: (progress: ScanProgress) => void,
  dataDir?: string,
): Promise<ScanSummary> {
  const resolvedDataDir = dataDir ?? process.env.DATA_DIR ?? './data'
  const libraryRows = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, libraryId))
  if (libraryRows.length === 0) {
    throw new Error(`Library not found: ${libraryId}`)
  }

  // Parse allowed media types — empty array means accept all
  let allowedMediaTypes: string[] = []
  try {
    allowedMediaTypes = JSON.parse(
      libraryRows[0]?.allowedMediaTypes ?? '[]',
    ) as string[]
  } catch {
    allowedMediaTypes = []
  }
  const hasTypeFilter = allowedMediaTypes.length > 0

  const sources = await db
    .select()
    .from(dataSources)
    .where(
      and(eq(dataSources.libraryId, libraryId), eq(dataSources.enabled, true)),
    )

  let totalNew = 0
  let totalUpdated = 0
  let totalRemoved = 0
  let totalDiscovered = 0

  for (const source of sources) {
    const existing = await db
      .select({ filePath: mediaItems.filePath, fileSize: mediaItems.fileSize })
      .from(mediaItems)
      .where(eq(mediaItems.dataSourceId, source.id))

    const result = await scanDataSource(source, existing)

    // Apply media type filter — changedFiles and newFiles only include matching types
    if (hasTypeFilter) {
      result.newFiles = result.newFiles.filter((e) =>
        allowedMediaTypes.includes(e.mediaCategory),
      )
      result.changedFiles = result.changedFiles.filter((e) =>
        allowedMediaTypes.includes(e.mediaCategory),
      )
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

      let thumbnailPaths: string | null = null
      if (isImageCategory(entry.mediaCategory)) {
        const thumbs = await generateThumbnails(
          entry.filePath,
          id,
          resolvedDataDir,
        )
        if (thumbs) {
          thumbnailPaths = JSON.stringify(thumbs)
        }
      } else if (isVideoCategory(entry.mediaCategory)) {
        const thumbs = await generateVideoThumbnails(
          entry.filePath,
          id,
          resolvedDataDir,
        )
        if (thumbs) {
          thumbnailPaths = JSON.stringify(thumbs)
        }
      }

      await db.insert(mediaItems).values({
        id,
        libraryId,
        dataSourceId: source.id,
        filePath: entry.filePath,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
        mimeType: entry.mimeType ?? null,
        mediaCategory: entry.mediaCategory,
        metadata,
        thumbnailPaths,
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

      const existingRows = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.dataSourceId, source.id),
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
        }
      } else if (isVideoCategory(entry.mediaCategory)) {
        const thumbs = await generateVideoThumbnails(
          entry.filePath,
          existingId,
          resolvedDataDir,
        )
        if (thumbs) {
          updateFields.thumbnailPaths = JSON.stringify(thumbs)
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
            eq(mediaItems.dataSourceId, source.id),
            eq(mediaItems.filePath, entry.filePath),
          ),
        )

      emitPluginEvent('media:updated', {
        mediaId: existingId,
        filePath: entry.filePath,
      })
      progress.processedFiles++
      totalUpdated++
    }

    if (result.removedFilePaths.length > 0) {
      const removedRows = await db
        .select({ id: mediaItems.id, filePath: mediaItems.filePath })
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.dataSourceId, source.id),
            inArray(mediaItems.filePath, result.removedFilePaths),
          ),
        )
      await db
        .delete(mediaItems)
        .where(
          and(
            eq(mediaItems.dataSourceId, source.id),
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
        })
      }
      totalRemoved += result.removedFilePaths.length
    }
  }

  // Backfill thumbnails for video/image items that were scanned before
  // thumbnail generation was implemented (thumbnailPaths IS NULL).
  const missingThumbs = await db
    .select({
      id: mediaItems.id,
      filePath: mediaItems.filePath,
      mediaCategory: mediaItems.mediaCategory,
    })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.libraryId, libraryId),
        isNull(mediaItems.thumbnailPaths),
      ),
    )

  for (const item of missingThumbs) {
    let thumbs = null
    if (isVideoCategory(item.mediaCategory)) {
      thumbs = await generateVideoThumbnails(
        item.filePath,
        item.id,
        resolvedDataDir,
      )
    } else if (isImageCategory(item.mediaCategory)) {
      thumbs = await generateThumbnails(item.filePath, item.id, resolvedDataDir)
    }
    if (thumbs) {
      await db
        .update(mediaItems)
        .set({ thumbnailPaths: JSON.stringify(thumbs), updatedAt: new Date() })
        .where(eq(mediaItems.id, item.id))
    }
  }

  // Auto-group TV episodes into series and season groups
  await groupTvEpisodes(db, libraryId)
  // Auto-group music tracks into artist and album groups
  await groupMusicTracks(db, libraryId)
  // Auto-group audiobook chapters into book and series groups
  await groupAudiobooks(db, libraryId)
  // Auto-group photos by date and GPS location
  await groupPhotos(db, libraryId)
  // Auto-tag images and documents with AI-generated tags
  await autoTagMediaItems(db, libraryId)

  return {
    libraryId,
    newItems: totalNew,
    updatedItems: totalUpdated,
    removedItems: totalRemoved,
    totalDiscovered,
  }
}
