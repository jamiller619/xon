import path, { basename, dirname, extname } from 'node:path'
import { CollectionType, MediaType } from '@xon/shared'
import { eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { collectionItems, collections, mediaItems } from '../db/schema.ts'
import { insertWithGeneratedPublicId } from '../lib/publicId.ts'
import * as libraryService from '../services/libraryService.ts'

export interface TvEpisodeInfo {
  seriesName: string | null
  season: number
  episode: number
}

/**
 * Parses TV episode info from a filename.
 * Supports: SxxExx, sXXeXX, NxNN patterns.
 * Returns null if no episode pattern is found.
 */
export function parseTvEpisode(fileName: string): TvEpisodeInfo | null {
  // Standard SxxExx pattern (case-insensitive)
  const sxeMatch = fileName.match(/^(.*?)[.\s_-]*[Ss](\d+)[Ee](\d+)/)
  if (sxeMatch) {
    const rawName =
      sxeMatch[1]
        ?.trim()
        .replace(/[._-]+/g, ' ')
        .trim() ?? ''
    return {
      seriesName: rawName.length > 0 ? rawName : null,
      season: Number.parseInt(sxeMatch[2] ?? '1', 10),
      episode: Number.parseInt(sxeMatch[3] ?? '1', 10),
    }
  }

  // NxNN pattern (e.g. 1x01)
  const nxMatch = fileName.match(/^(.*?)[.\s_-]*(\d+)x(\d{2,})/i)
  if (nxMatch) {
    const rawName =
      nxMatch[1]
        ?.trim()
        .replace(/[._-]+/g, ' ')
        .trim() ?? ''
    return {
      seriesName: rawName.length > 0 ? rawName : null,
      season: Number.parseInt(nxMatch[2] ?? '1', 10),
      episode: Number.parseInt(nxMatch[3] ?? '1', 10),
    }
  }

  return null
}

/**
 * Determines the series name for a TV episode given its file path and parsed info.
 * Priority:
 * 1. Series name from filename (if non-empty)
 * 2. Grandparent directory (if parent looks like "Season N" or "SXX")
 * 3. Parent directory
 */
export function resolveSeriesName(
  filePath: string,
  info: TvEpisodeInfo,
): string {
  if (info.seriesName) {
    return info.seriesName
  }
  const parentDir = basename(dirname(filePath))
  const grandParentDir = basename(dirname(dirname(filePath)))

  // If parent looks like "Season 1", "Season01", "S01" etc., use grandparent
  if (/^(?:season|s)\s*\d+$/i.test(parentDir)) {
    return grandParentDir.length > 0 ? grandParentDir : parentDir
  }
  return parentDir.length > 0 ? parentDir : 'Unknown Series'
}

/**
 * Makes a deterministic collection ID for a series or season collection.
 * This allows idempotent upserts without extra unique indexes.
 */
function makeSeriesCollectionId(
  libraryId: string,
  seriesTitle: string,
): string {
  return `col:series:${libraryId}:${seriesTitle}`
}

function makeSeasonCollectionId(
  seriesCollectionId: string,
  season: number,
): string {
  return `col:season:${seriesCollectionId}:${season}`
}

/**
 * Auto-creates series and season collections for TV Show media items in a library,
 * then assigns each episode to its season collection.
 * Idempotent: safe to call after every scan.
 */
export async function createTvCollections(
  db: LibSQLDatabase,
  libraryId: string,
  userId: number,
): Promise<void> {
  // Fetch all TV Show items for this library
  const tvItems = await libraryService.getMediaByTypeAndLibraryId(
    db,
    MediaType.MainType.Video,
    libraryId,
  )

  // Filter to only TV episodes
  const episodes: Array<{
    id: string
    filePath: string
    fileName: string
    info: TvEpisodeInfo
    seriesName: string
  }> = []

  for (const item of tvItems) {
    const fileName = path.basename(item.filePath)
    const info = parseTvEpisode(fileName)
    if (info) {
      episodes.push({
        id: item.id,
        filePath: item.filePath,
        fileName,
        info,
        seriesName: resolveSeriesName(item.filePath, info),
      })
    }
  }

  if (episodes.length === 0) return

  // Build the set of series and season collections we need
  const seriesCollectionIds = new Set<string>()
  const seasonCollectionMap = new Map<
    string,
    { id: string; seriesCollectionId: string; season: number }
  >()

  for (const ep of episodes) {
    const seriesCollectionId = makeSeriesCollectionId(libraryId, ep.seriesName)
    seriesCollectionIds.add(seriesCollectionId)

    const seasonCollectionId = makeSeasonCollectionId(
      seriesCollectionId,
      ep.info.season,
    )
    if (!seasonCollectionMap.has(seasonCollectionId)) {
      seasonCollectionMap.set(seasonCollectionId, {
        id: seasonCollectionId,
        seriesCollectionId,
        season: ep.info.season,
      })
    }
  }

  const collectionsByKey = await autoCollectionsByKey(db, userId)

  // Insert missing series collections
  const seriesInserts: Array<typeof collections.$inferInsert> = []
  for (const seriesCollectionId of seriesCollectionIds) {
    if (!collectionsByKey.has(seriesCollectionId)) {
      const seriesTitle = episodes.find(
        (e) =>
          makeSeriesCollectionId(libraryId, e.seriesName) ===
          seriesCollectionId,
      )?.seriesName
      if (seriesTitle) {
        seriesInserts.push({
          type: CollectionType.Series,
          title: seriesTitle,
          parentCollectionId: null,
          metadata: autoCollectionMetadata(seriesCollectionId),
          userId,
        })
      }
    }
  }
  if (seriesInserts.length > 0) {
    const inserted = await insertAutoCollections(db, seriesInserts)
    addAutoCollections(collectionsByKey, inserted)
  }

  // Insert missing season collections
  const seasonInserts: Array<typeof collections.$inferInsert> = []
  for (const [
    seasonCollectionId,
    { seriesCollectionId, season },
  ] of seasonCollectionMap) {
    if (!collectionsByKey.has(seasonCollectionId)) {
      const parentCollectionId = collectionsByKey.get(seriesCollectionId)
      if (parentCollectionId === undefined) continue
      seasonInserts.push({
        type: CollectionType.Season,
        title: `Season ${season}`,
        parentCollectionId,
        metadata: autoCollectionMetadata(seasonCollectionId),
        userId,
      })
    }
  }
  if (seasonInserts.length > 0) {
    const inserted = await insertAutoCollections(db, seasonInserts)
    addAutoCollections(collectionsByKey, inserted)
  }

  // Fetch existing collection members to avoid duplicates
  const mediaIdsByPublicId = await internalMediaIds(
    db,
    episodes.map((e) => e.id),
  )
  const episodeIds = [...mediaIdsByPublicId.values()]
  if (episodeIds.length === 0) return
  const existingMembers = await db
    .select({ mediaItemId: collectionItems.mediaItemId })
    .from(collectionItems)
    .where(inArray(collectionItems.mediaItemId, episodeIds))
  const existingMemberSet = new Set(existingMembers.map((m) => m.mediaItemId))

  // Insert missing collection members
  const memberInserts: Array<typeof collectionItems.$inferInsert> = []
  for (const ep of episodes) {
    const mediaItemId = mediaIdsByPublicId.get(ep.id)
    if (mediaItemId !== undefined && !existingMemberSet.has(mediaItemId)) {
      const seriesCollectionId = makeSeriesCollectionId(
        libraryId,
        ep.seriesName,
      )
      const seasonCollectionId = makeSeasonCollectionId(
        seriesCollectionId,
        ep.info.season,
      )
      const collectionId = collectionsByKey.get(seasonCollectionId)
      if (collectionId === undefined) continue
      memberInserts.push({
        collectionId,
        mediaItemId,
        sortOrder: ep.info.episode,
      })
    }
  }
  if (memberInserts.length > 0) {
    await db.insert(collectionItems).values(memberInserts)
  }
}

/**
 * Resolves the book title and optional series name for an audiobook file.
 * Priority for book title: album tag → parent folder name → filename without extension.
 * Priority for series name: series tag → parent folder (when parent folder differs from album tag).
 */
export function resolveAudiobookInfo(
  filePath: string,
  tags: Record<string, unknown>,
): { bookTitle: string; seriesName: string | null } {
  const parentDir = basename(dirname(filePath))
  const grandParentDir = basename(dirname(dirname(filePath)))

  const albumTag =
    typeof tags.album === 'string' && tags.album.length > 0 ? tags.album : null
  const seriesTag =
    typeof tags.series === 'string' && tags.series.length > 0
      ? tags.series
      : null

  let bookTitle: string
  let seriesName: string | null = null

  if (albumTag) {
    bookTitle = albumTag
    if (seriesTag) {
      seriesName = seriesTag
    } else if (parentDir && parentDir !== '.' && parentDir !== albumTag) {
      // Parent folder is distinct from the book title — likely a series folder
      seriesName = parentDir
    }
  } else {
    // No album tag — infer from folder structure
    bookTitle =
      parentDir && parentDir !== '.'
        ? parentDir
        : basename(filePath).slice(0, -extname(filePath).length) ||
          'Unknown Book'

    if (seriesTag) {
      seriesName = seriesTag
    } else if (
      grandParentDir &&
      grandParentDir !== '.' &&
      grandParentDir.length > 0
    ) {
      // Grandparent is likely the series folder when we have a deep folder structure
      seriesName = grandParentDir
    }
  }

  return { bookTitle, seriesName }
}

function makeMusicArtistCollectionId(
  libraryId: string,
  artistName: string,
): string {
  return `col:artist:${libraryId}:${artistName}`
}

function makeMusicAlbumCollectionId(
  libraryId: string,
  albumArtist: string,
  albumTitle: string,
): string {
  return `col:album:${libraryId}:${albumArtist}:${albumTitle}`
}

interface MusicTrackData {
  id: string
  album: string
  artist: string
  trackNumber: number
  discNumber: number
}

/**
 * Auto-creates artist and album collections for Music media items in a library,
 * then assigns each track to its album collection sorted by disc/track number.
 * Compilation albums (multiple artists) are organized under "Various Artists".
 * Idempotent: safe to call after every scan.
 */
export async function createMusicCollections(
  db: LibSQLDatabase,
  libraryId: string,
  userId: number,
): Promise<void> {
  // Fetch all Music category items for this library
  const musicItems = await libraryService.getMediaByTypeAndLibraryId(
    db,
    MediaType.MainType.Audio,
    libraryId,
  )

  if (musicItems.length === 0) return

  // Parse tags and collect tracks that have album metadata
  const tracks: MusicTrackData[] = []
  for (const item of musicItems) {
    const tags = item.metadata

    if (typeof tags.album === 'string' && tags.album.length > 0) {
      tracks.push({
        id: item.id,
        album: tags.album,
        artist:
          typeof tags.artist === 'string' ? tags.artist : 'Unknown Artist',
        trackNumber:
          typeof tags.trackNumber === 'number' ? tags.trackNumber : 0,
        discNumber: typeof tags.discNumber === 'number' ? tags.discNumber : 1,
      })
    }
  }

  if (tracks.length === 0) return

  // Detect compilation albums: if multiple distinct artists share the same album title
  const albumArtistsMap = new Map<string, Set<string>>()
  for (const track of tracks) {
    const set = albumArtistsMap.get(track.album)
    if (set) {
      set.add(track.artist)
    } else {
      albumArtistsMap.set(track.album, new Set([track.artist]))
    }
  }

  const getAlbumArtist = (albumTitle: string): string => {
    const artistSet = albumArtistsMap.get(albumTitle)
    if (!artistSet || artistSet.size > 1) return 'Various Artists'
    const first = [...artistSet][0]
    return first ?? 'Unknown Artist'
  }

  // Collect unique artist collection IDs and album collection entries
  const artistCollectionIds = new Map<string, string>() // artistName → collectionId
  const albumCollectionMap = new Map<
    string,
    { id: string; albumArtist: string; albumTitle: string }
  >()

  for (const track of tracks) {
    const albumArtist = getAlbumArtist(track.album)
    if (!artistCollectionIds.has(albumArtist)) {
      artistCollectionIds.set(
        albumArtist,
        makeMusicArtistCollectionId(libraryId, albumArtist),
      )
    }
    const albumCollectionId = makeMusicAlbumCollectionId(
      libraryId,
      albumArtist,
      track.album,
    )
    if (!albumCollectionMap.has(albumCollectionId)) {
      albumCollectionMap.set(albumCollectionId, {
        id: albumCollectionId,
        albumArtist,
        albumTitle: track.album,
      })
    }
  }

  const collectionsByKey = await autoCollectionsByKey(db, userId)

  // Insert missing artist collections
  const artistInserts: Array<typeof collections.$inferInsert> = []
  for (const [artistName, artistCollectionId] of artistCollectionIds) {
    if (!collectionsByKey.has(artistCollectionId)) {
      artistInserts.push({
        type: CollectionType.Artist,
        title: artistName,
        parentCollectionId: null,
        metadata: autoCollectionMetadata(artistCollectionId),
        userId,
      })
    }
  }
  if (artistInserts.length > 0) {
    const inserted = await insertAutoCollections(db, artistInserts)
    addAutoCollections(collectionsByKey, inserted)
  }

  // Insert missing album collections
  const albumInserts: Array<typeof collections.$inferInsert> = []
  for (const [
    albumCollectionId,
    { albumArtist, albumTitle },
  ] of albumCollectionMap) {
    if (!collectionsByKey.has(albumCollectionId)) {
      const artistCollectionKey = artistCollectionIds.get(albumArtist)
      const artistCollectionId = artistCollectionKey
        ? (collectionsByKey.get(artistCollectionKey) ?? null)
        : null
      albumInserts.push({
        type: CollectionType.Album,
        title: albumTitle,
        parentCollectionId: artistCollectionId,
        metadata: autoCollectionMetadata(albumCollectionId),
        userId,
      })
    }
  }
  if (albumInserts.length > 0) {
    const inserted = await insertAutoCollections(db, albumInserts)
    addAutoCollections(collectionsByKey, inserted)
  }

  // Fetch existing collection members
  const mediaIdsByPublicId = await internalMediaIds(
    db,
    tracks.map((t) => t.id),
  )
  const trackIds = [...mediaIdsByPublicId.values()]
  if (trackIds.length === 0) return
  const existingMembers = await db
    .select({ mediaItemId: collectionItems.mediaItemId })
    .from(collectionItems)
    .where(inArray(collectionItems.mediaItemId, trackIds))
  const existingMemberSet = new Set(existingMembers.map((m) => m.mediaItemId))

  // Insert missing members — sort by disc * 1000 + trackNumber
  const memberInserts: Array<typeof collectionItems.$inferInsert> = []
  for (const track of tracks) {
    const mediaItemId = mediaIdsByPublicId.get(track.id)
    if (mediaItemId !== undefined && !existingMemberSet.has(mediaItemId)) {
      const albumArtist = getAlbumArtist(track.album)
      const albumCollectionId = makeMusicAlbumCollectionId(
        libraryId,
        albumArtist,
        track.album,
      )
      const collectionId = collectionsByKey.get(albumCollectionId)
      if (collectionId === undefined) continue
      memberInserts.push({
        collectionId,
        mediaItemId,
        sortOrder: track.discNumber * 1000 + track.trackNumber,
      })
    }
  }
  if (memberInserts.length > 0) {
    await db.insert(collectionItems).values(memberInserts)
  }
}

function makePhotoDateCollectionId(libraryId: string, dateStr: string): string {
  return `col:photo-date:${libraryId}:${dateStr}`
}

function makePhotoLocationCollectionId(
  libraryId: string,
  lat: string,
  lon: string,
): string {
  return `col:photo-location:${libraryId}:${lat}:${lon}`
}

/**
 * Parses the date portion from an EXIF dateTaken string.
 * EXIF format: "YYYY:MM:DD HH:MM:SS"
 * Returns "YYYY-MM-DD" or null if not parseable.
 */
export function parseExifDate(dateTaken: string): string | null {
  const match = dateTaken.match(/^(\d{4}):(\d{2}):(\d{2})/)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

/**
 * Parses an EXIF date string into a Unix timestamp (seconds) for sort ordering.
 * Returns 0 if not parseable.
 */
export function parseExifTimestamp(dateTaken: string): number {
  const match = dateTaken.match(
    /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
  )
  if (!match) return 0
  const d = new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`,
  )
  return Math.floor(d.getTime() / 1000)
}

/**
 * Clusters a GPS coordinate to a ~11km grid cell by rounding to 1 decimal place.
 * Returns the rounded value formatted to 1 decimal place.
 */
export function clusterCoordinate(coord: number): string {
  return (Math.round(coord * 10) / 10).toFixed(1)
}

interface PhotoData {
  id: string
  dateStr: string | null
  timestamp: number
  latCluster: string | null
  lonCluster: string | null
}

/**
 * Auto-creates date and location collections for Pictures/Images media items.
 * Date collections: one per unique day (EXIF DateTimeOriginal), photos sorted by time.
 * Location collections: one per GPS cluster (rounded to 1 decimal degree, ~11 km).
 * Idempotent: safe to call after every scan.
 */
export async function createPhotoCollections(
  db: LibSQLDatabase,
  libraryId: string,
  userId: number,
): Promise<void> {
  const photoItems = await libraryService.getMediaByTypeAndLibraryId(
    db,
    MediaType.MainType.Image,
    libraryId,
  )

  if (photoItems.length === 0) return

  const photos: PhotoData[] = []
  for (const item of photoItems) {
    const meta = item.metadata

    const dateTaken = typeof meta.dateTaken === 'string' ? meta.dateTaken : null
    const dateStr = dateTaken ? parseExifDate(dateTaken) : null
    const timestamp = dateTaken ? parseExifTimestamp(dateTaken) : 0

    const lat = typeof meta.gpsLatitude === 'number' ? meta.gpsLatitude : null
    const lon = typeof meta.gpsLongitude === 'number' ? meta.gpsLongitude : null
    const latCluster = lat !== null ? clusterCoordinate(lat) : null
    const lonCluster = lon !== null ? clusterCoordinate(lon) : null

    photos.push({ id: item.id, dateStr, timestamp, latCluster, lonCluster })
  }

  // Build unique date collections
  const dateCollectionMap = new Map<string, string>() // collectionId → dateStr
  for (const photo of photos) {
    if (photo.dateStr) {
      const gid = makePhotoDateCollectionId(libraryId, photo.dateStr)
      if (!dateCollectionMap.has(gid)) {
        dateCollectionMap.set(gid, photo.dateStr)
      }
    }
  }

  // Build unique location collections
  const locationCollectionMap = new Map<string, { lat: string; lon: string }>()
  for (const photo of photos) {
    if (photo.latCluster !== null && photo.lonCluster !== null) {
      const gid = makePhotoLocationCollectionId(
        libraryId,
        photo.latCluster,
        photo.lonCluster,
      )
      if (!locationCollectionMap.has(gid)) {
        locationCollectionMap.set(gid, {
          lat: photo.latCluster,
          lon: photo.lonCluster,
        })
      }
    }
  }

  const allCollectionIds = [
    ...dateCollectionMap.keys(),
    ...locationCollectionMap.keys(),
  ]
  if (allCollectionIds.length === 0) return

  const collectionsByKey = await autoCollectionsByKey(db, userId)

  // Insert missing date collections
  const dateInserts: Array<typeof collections.$inferInsert> = []
  for (const [gid, dateStr] of dateCollectionMap) {
    if (!collectionsByKey.has(gid)) {
      dateInserts.push({
        type: CollectionType.PhotoDate,
        title: dateStr,
        parentCollectionId: null,
        metadata: autoCollectionMetadata(gid),
        userId,
      })
    }
  }
  if (dateInserts.length > 0) {
    const inserted = await insertAutoCollections(db, dateInserts)
    addAutoCollections(collectionsByKey, inserted)
  }

  // Insert missing location collections
  const locationInserts: Array<typeof collections.$inferInsert> = []
  for (const [gid, { lat, lon }] of locationCollectionMap) {
    if (!collectionsByKey.has(gid)) {
      locationInserts.push({
        type: CollectionType.PhotoLocation,
        title: `${lat}, ${lon}`,
        parentCollectionId: null,
        metadata: JSON.stringify({ autoKey: gid, lat, lon }),
        userId,
      })
    }
  }
  if (locationInserts.length > 0) {
    const inserted = await insertAutoCollections(db, locationInserts)
    addAutoCollections(collectionsByKey, inserted)
  }

  // Fetch existing members to avoid duplicates (track by collectionId:mediaItemId)
  const mediaIdsByPublicId = await internalMediaIds(
    db,
    photos.map((p) => p.id),
  )
  const photoIds = [...mediaIdsByPublicId.values()]
  if (photoIds.length === 0) return
  const existingMembers = await db
    .select({
      collectionId: collectionItems.collectionId,
      mediaItemId: collectionItems.mediaItemId,
    })
    .from(collectionItems)
    .where(inArray(collectionItems.mediaItemId, photoIds))
  const existingMemberKeys = new Set(
    existingMembers.map((m) => `${m.collectionId}:${m.mediaItemId}`),
  )

  // Insert missing memberships
  const memberInserts: Array<typeof collectionItems.$inferInsert> = []
  for (const photo of photos) {
    const mediaItemId = mediaIdsByPublicId.get(photo.id)
    if (mediaItemId === undefined) continue
    if (photo.dateStr) {
      const gid = makePhotoDateCollectionId(libraryId, photo.dateStr)
      const collectionId = collectionsByKey.get(gid)
      if (collectionId === undefined) continue
      const key = `${collectionId}:${mediaItemId}`
      if (!existingMemberKeys.has(key)) {
        memberInserts.push({
          collectionId,
          mediaItemId,
          sortOrder: photo.timestamp,
        })
      }
    }
    if (photo.latCluster !== null && photo.lonCluster !== null) {
      const gid = makePhotoLocationCollectionId(
        libraryId,
        photo.latCluster,
        photo.lonCluster,
      )
      const collectionId = collectionsByKey.get(gid)
      if (collectionId === undefined) continue
      const key = `${collectionId}:${mediaItemId}`
      if (!existingMemberKeys.has(key)) {
        memberInserts.push({
          collectionId,
          mediaItemId,
          sortOrder: 0,
        })
      }
    }
  }
  if (memberInserts.length > 0) {
    await db.insert(collectionItems).values(memberInserts)
  }
}

function autoCollectionMetadata(autoKey: string): string {
  return JSON.stringify({ autoKey })
}

function autoKeyFromMetadata(metadata: string): string | undefined {
  try {
    const parsed = JSON.parse(metadata) as { autoKey?: unknown }
    return typeof parsed.autoKey === 'string' ? parsed.autoKey : undefined
  } catch {
    return undefined
  }
}

async function autoCollectionsByKey(
  db: LibSQLDatabase,
  userId: number,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      id: collections.id,
      publicId: collections.publicId,
      metadata: collections.metadata,
    })
    .from(collections)
    .where(eq(collections.userId, userId))
  const result = new Map<string, number>()
  addAutoCollections(result, rows)
  return result
}

function addAutoCollections(
  target: Map<string, number>,
  rows: Array<{ id: number; metadata: string; publicId?: string }>,
): void {
  for (const row of rows) {
    const autoKey =
      autoKeyFromMetadata(row.metadata) ??
      (row.publicId?.startsWith('col:') ? row.publicId : undefined)
    if (autoKey) target.set(autoKey, row.id)
  }
}

async function internalMediaIds(
  db: LibSQLDatabase,
  publicIds: string[],
): Promise<Map<string, number>> {
  if (publicIds.length === 0) return new Map()
  const rows = await db
    .select({ id: mediaItems.id, publicId: mediaItems.publicId })
    .from(mediaItems)
    .where(inArray(mediaItems.publicId, publicIds))
  return new Map(rows.map((row) => [row.publicId, row.id]))
}

async function insertAutoCollections(
  db: LibSQLDatabase,
  values: Array<typeof collections.$inferInsert>,
): Promise<Array<{ id: number; metadata: string }>> {
  const inserted: Array<{ id: number; metadata: string }> = []
  for (const value of values) {
    const row = await insertWithGeneratedPublicId(async (publicId) => {
      const [created] = await db
        .insert(collections)
        .values({ ...value, publicId })
        .returning({ id: collections.id, metadata: collections.metadata })
      if (!created) throw new Error('Failed to create automatic collection')
      return created
    })
    inserted.push(row)
  }
  return inserted
}
