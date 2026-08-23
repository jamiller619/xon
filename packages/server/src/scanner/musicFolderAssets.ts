import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CollectionType,
  type DataSource,
  type Metadata,
  type PosterImage,
  posterImages,
} from '@xon/shared'
import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { collectionItems, collections, mediaItems } from '../db/schema.ts'
import { insertWithGeneratedPublicId } from '../lib/publicId.ts'
import type { Logger } from '../logger.ts'
import {
  libraryImageCacheReference,
  resolveCacheReference,
  thumbnailCacheReference,
} from '../media/cachePaths.ts'
import {
  relativeMediaFilePath,
  resolveMediaFilePath,
} from '../media/mediaFilePaths.ts'
import { writeThumbnailImages } from '../media/thumbnails.ts'

const PLAYLIST_MEDIA_TYPES = new Set([
  'application/pls+xml',
  'application/vnd.apple.mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
])

type ArtworkCategory = 'poster' | 'backdrop' | 'logo'

type ImportMusicFolderAssetsOptions = {
  db: LibSQLDatabase
  libraryId: number
  libraryPublicId: string
  ownerId: number
  dataSource: DataSource
  artworkPaths: string[]
  playlistPaths: string[]
  logger: Logger
}

type MusicRow = {
  id: number
  publicId: string
  filePath: string
  mediaType: string
  fileMetadata: Metadata
  metadata: Metadata
}

export async function importMusicFolderAssets(
  options: ImportMusicFolderAssetsOptions,
): Promise<void> {
  const importStart = Date.now()
  options.logger.info('Music folder asset import started', {
    libraryId: options.libraryPublicId,
    dataSourceId: options.dataSource.id,
    artworkFiles: options.artworkPaths.length,
    playlistFiles: options.playlistPaths.length,
  })

  const mediaLookupStart = Date.now()
  const rows = await options.db
    .select({
      id: mediaItems.id,
      publicId: mediaItems.publicId,
      filePath: mediaItems.filePath,
      mediaType: mediaItems.mediaType,
      fileMetadata: mediaItems.fileMetadata,
      metadata: mediaItems.metadata,
    })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.libraryId, options.libraryId),
        eq(mediaItems.dataSourceId, options.dataSource.id),
      ),
    )

  options.logger.info('Music folder asset media lookup finished', {
    libraryId: options.libraryPublicId,
    dataSourceId: options.dataSource.id,
    durationMs: Date.now() - mediaLookupStart,
    mediaItems: rows.length,
  })

  const artworkStart = Date.now()
  await importAlbumArtwork(options, rows)
  options.logger.info('Music folder artwork import finished', {
    libraryId: options.libraryPublicId,
    dataSourceId: options.dataSource.id,
    durationMs: Date.now() - artworkStart,
    artworkFiles: options.artworkPaths.length,
  })

  const playlistStart = Date.now()
  await importPlaylists(options, rows)
  options.logger.info('Music playlist import finished', {
    libraryId: options.libraryPublicId,
    dataSourceId: options.dataSource.id,
    durationMs: Date.now() - playlistStart,
    playlistFiles: options.playlistPaths.length,
  })

  options.logger.info('Music folder asset import finished', {
    libraryId: options.libraryPublicId,
    dataSourceId: options.dataSource.id,
    durationMs: Date.now() - importStart,
  })
}

async function importAlbumArtwork(
  options: ImportMusicFolderAssetsOptions,
  rows: MusicRow[],
): Promise<void> {
  const tracksByDirectory = new Map<string, MusicRow[]>()
  for (const row of rows) {
    if (
      !row.mediaType.startsWith('audio/') ||
      isPlaylistMediaType(row.mediaType)
    ) {
      continue
    }
    const directory = path.posix.dirname(row.filePath)
    const tracks = tracksByDirectory.get(directory) ?? []
    tracks.push(row)
    tracksByDirectory.set(directory, tracks)
  }

  const artworkByDirectory = new Map<string, string[]>()
  for (const artworkPath of options.artworkPaths) {
    const relativePath = relativeMediaFilePath(artworkPath, options.dataSource)
    const directory = path.posix.dirname(relativePath)
    const artwork = artworkByDirectory.get(directory) ?? []
    artwork.push(artworkPath)
    artworkByDirectory.set(directory, artwork)
  }

  for (const [directory, artworkPaths] of artworkByDirectory) {
    const tracks = tracksByDirectory.get(directory)
    if (!tracks || tracks.length === 0) {
      options.logger.debug(
        'Ignoring music-folder artwork without sibling tracks',
        {
          directory,
        },
      )
      continue
    }

    const albumHash = shortHash(`${options.dataSource.id}:${directory}`)
    const imported = await Promise.all(
      artworkPaths
        .sort((a, b) => artworkRank(a) - artworkRank(b) || a.localeCompare(b))
        .map((artworkPath) =>
          importArtworkFile(
            options.libraryPublicId,
            albumHash,
            artworkPath,
            options.logger,
          ),
        ),
    )
    const validArtwork = imported.filter(
      (entry): entry is ImportedArtwork => entry !== null,
    )
    if (validArtwork.length === 0) continue

    const localPrefix = `library-images/${options.libraryPublicId}/album-${albumHash}-`
    for (const track of tracks) {
      const images = mergeAlbumArtwork(
        track.metadata.images as Record<string, unknown> | undefined,
        validArtwork,
        localPrefix,
      )
      if (JSON.stringify(images) === JSON.stringify(track.metadata.images)) {
        continue
      }
      const metadata = { ...track.metadata, images }
      await options.db
        .update(mediaItems)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(mediaItems.id, track.id))
      track.metadata = metadata
    }
  }
}

export type ImportedArtwork = {
  category: ArtworkCategory
  source: string
  poster?: PosterImage
}

async function importArtworkFile(
  libraryPublicId: string,
  albumHash: string,
  artworkPath: string,
  logger: Logger,
): Promise<ImportedArtwork | null> {
  try {
    const buffer = await readFile(artworkPath)
    const imageHash = shortHash(
      `${path.basename(artworkPath)}:${buffer.byteLength}:${buffer.subarray(0, 256).toString('base64')}`,
    )
    const extension = normalizedImageExtension(artworkPath)
    const fileName = `album-${albumHash}-${imageHash}${extension}`
    const source = libraryImageCacheReference(libraryPublicId, fileName)
    const target = resolveCacheReference(source)
    if (!(await fileExists(target))) {
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, buffer)
    }

    const category = classifyAlbumArtwork(path.basename(artworkPath))
    if (category !== 'poster') return { category, source }

    const thumbnailFileName = `${libraryPublicId}_album_${albumHash}_${imageHash}`
    const expectedThumbnails = {
      small: thumbnailCacheReference(`${thumbnailFileName}_small.jpg`),
      medium: thumbnailCacheReference(`${thumbnailFileName}_medium.jpg`),
      large: thumbnailCacheReference(`${thumbnailFileName}_large.jpg`),
    }
    const thumbnails = (await referencesExist(
      Object.values(expectedThumbnails),
    ))
      ? expectedThumbnails
      : await writeThumbnailImages(thumbnailFileName, buffer)
    return {
      category,
      source,
      poster: { src: source, ...(thumbnails ? { thumbnails } : {}) },
    }
  } catch (err) {
    logger.warn('Failed to import music-folder artwork', {
      artworkPath,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export function mergeAlbumArtwork(
  existingImages: Record<string, unknown> | undefined,
  imported: ImportedArtwork[],
  localPrefix: string,
): Record<string, unknown> {
  const images = { ...existingImages }
  const existingPosters = posterImages(
    images.poster as Parameters<typeof posterImages>[0],
  ).filter((entry) => !entry.src.startsWith(localPrefix))
  const existingBackdrops = imageSources(images.backdrop).filter(
    (source) => !source.startsWith(localPrefix),
  )
  const existingLogos = imageSources(images.logo).filter(
    (source) => !source.startsWith(localPrefix),
  )

  const posters = imported.flatMap((entry) =>
    entry.category === 'poster' && entry.poster ? [entry.poster] : [],
  )
  const backdrops = imported.flatMap((entry) =>
    entry.category === 'backdrop' ? [entry.source] : [],
  )
  const logos = imported.flatMap((entry) =>
    entry.category === 'logo' ? [entry.source] : [],
  )

  if (posters.length > 0 || existingPosters.length > 0) {
    images.poster = [...posters, ...existingPosters]
  }
  if (backdrops.length > 0 || existingBackdrops.length > 0) {
    images.backdrop = [...backdrops, ...existingBackdrops]
  }
  if (logos.length > 0 || existingLogos.length > 0) {
    images.logo = [...logos, ...existingLogos]
  }
  return images
}

async function importPlaylists(
  options: ImportMusicFolderAssetsOptions,
  rows: MusicRow[],
): Promise<void> {
  const mediaByAbsolutePath = new Map<string, number>()
  for (const row of rows) {
    if (isPlaylistMediaType(row.mediaType)) continue
    try {
      mediaByAbsolutePath.set(
        path.normalize(resolveMediaFilePath(row.filePath, options.dataSource)),
        row.id,
      )
    } catch {
      // A stale row outside the current source cannot be a playlist member.
    }
  }

  const existingCollections = await options.db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.userId, options.ownerId),
        eq(collections.type, CollectionType.Playlist),
      ),
    )

  for (const playlistPath of options.playlistPaths) {
    const sourcePath = relativeMediaFilePath(playlistPath, options.dataSource)
    const autoKey = `music-playlist:${options.libraryPublicId}:${options.dataSource.id}:${sourcePath}`
    const entries = parsePlaylistEntries(
      await readFile(playlistPath, 'utf8'),
      path.extname(playlistPath),
    )
    const resolved: number[] = []
    let unresolvedEntries = 0
    for (const entry of entries) {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(entry)) {
        unresolvedEntries++
        continue
      }
      const localEntry = entry.replaceAll('\\', path.sep)
      const absolutePath = path.isAbsolute(localEntry)
        ? path.normalize(localEntry)
        : path.resolve(path.dirname(playlistPath), localEntry)
      const mediaId = mediaByAbsolutePath.get(absolutePath)
      if (mediaId === undefined) unresolvedEntries++
      else if (!resolved.includes(mediaId)) resolved.push(mediaId)
    }

    const metadata = JSON.stringify({
      autoKey,
      importedPlaylist: {
        libraryId: options.libraryPublicId,
        dataSourceId: options.dataSource.id,
        filePath: sourcePath,
        entries: entries.length,
        matchedEntries: resolved.length,
        unresolvedEntries,
      },
    })
    const title = path.basename(playlistPath, path.extname(playlistPath))
    const existing = existingCollections.find(
      (collection) => autoKeyFromMetadata(collection.metadata) === autoKey,
    )
    const collectionId = existing
      ? existing.id
      : await insertWithGeneratedPublicId(async (publicId) => {
          const [created] = await options.db
            .insert(collections)
            .values({
              publicId,
              userId: options.ownerId,
              type: CollectionType.Playlist,
              title,
              metadata,
            })
            .returning({ id: collections.id })
          if (!created) throw new Error('Failed to import playlist')
          return created.id
        })

    if (existing) {
      await options.db
        .update(collections)
        .set({ title, metadata, updatedAt: new Date() })
        .where(eq(collections.id, collectionId))
    }
    await options.db
      .delete(collectionItems)
      .where(eq(collectionItems.collectionId, collectionId))
    if (resolved.length > 0) {
      await options.db.insert(collectionItems).values(
        resolved.map((mediaItemId, sortOrder) => ({
          collectionId,
          mediaItemId,
          sortOrder,
        })),
      )
    }

    if (unresolvedEntries > 0) {
      options.logger.warn('Music playlist contains unresolved entries', {
        playlist: sourcePath,
        unresolvedEntries,
        entries: entries.length,
      })
    }
  }
}

export function parsePlaylistEntries(
  contents: string,
  extension: string,
): string[] {
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (extension.toLowerCase() === '.pls') {
    return lines.flatMap((line) => {
      const match = /^File\d+=(.+)$/i.exec(line.trim())
      return match?.[1]?.trim() ? [match[1].trim()] : []
    })
  }
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

export function classifyAlbumArtwork(fileName: string): ArtworkCategory {
  const normalized = fileName.toLocaleLowerCase()
  if (/(?:^|[\s._-])(?:logo|clearlogo)(?:[\s._-]|$)/.test(normalized)) {
    return 'logo'
  }
  if (/(?:^|[\s._-])(?:back|backcover|rear)(?:[\s._-]|$)/.test(normalized)) {
    return 'backdrop'
  }
  return 'poster'
}

function artworkRank(filePath: string): number {
  const name = path.basename(filePath).toLocaleLowerCase()
  if (/(?:^|[\s._-])(?:front|cover|folder)(?:[\s._-]|$)/.test(name)) return 0
  if (classifyAlbumArtwork(name) === 'poster') return 1
  if (classifyAlbumArtwork(name) === 'backdrop') return 2
  return 3
}

function normalizedImageExtension(filePath: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase()
  return /^\.(?:avif|gif|jpe?g|png|webp)$/.test(extension) ? extension : '.jpg'
}

function imageSources(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values.flatMap((entry) => {
    if (typeof entry === 'string') return [entry]
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { src?: unknown }).src === 'string'
    ) {
      return [(entry as { src: string }).src]
    }
    return []
  })
}

function isPlaylistMediaType(mediaType: string): boolean {
  return PLAYLIST_MEDIA_TYPES.has(mediaType)
}

function autoKeyFromMetadata(metadata: string): string | undefined {
  try {
    const parsed = JSON.parse(metadata) as { autoKey?: unknown }
    return typeof parsed.autoKey === 'string' ? parsed.autoKey : undefined
  } catch {
    return undefined
  }
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

async function referencesExist(references: string[]): Promise<boolean> {
  const results = await Promise.all(
    references.map((reference) => fileExists(resolveCacheReference(reference))),
  )
  return results.every(Boolean)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}
