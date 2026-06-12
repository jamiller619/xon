import path, { basename, dirname, extname } from 'node:path'
import { GroupType, MediaType } from '@xon/shared'
// import { GroupType, getMediaTypesForCategory, MediaCategory } from '@xon/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { groupItems, groups, mediaItems } from '../db/schema.ts'
import * as libraryService from '../services/libraryService.ts'

export interface TvEpisodeInfo {
  seriesName: string | null
  season: number
  episode: number
}

// export async function checkIfSeeded(db: LibSQLDatabase): Promise<void> {
//   const data = await db.select().from(groups)

//   if (data.length === 0) {
//     await db.insert(groups).values({
//       title: 'Favorites',
//       type: GroupType.Collection,
//     })
//   }
// }

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
 * Makes a deterministic group ID for a series or season group.
 * This allows idempotent upserts without extra unique indexes.
 */
function makeSeriesGroupId(libraryId: string, seriesTitle: string): string {
  return `grp:series:${libraryId}:${seriesTitle}`
}

function makeSeasonGroupId(seriesGroupId: string, season: number): string {
  return `grp:season:${seriesGroupId}:${season}`
}

/**
 * Auto-creates series and season groups for TV Show media items in a library,
 * then assigns each episode to its season group.
 * Idempotent: safe to call after every scan.
 */
export async function groupTvEpisodes(
  db: LibSQLDatabase,
  libraryId: string,
  userId: string,
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

  // Build the set of series and season groups we need
  const seriesGroupIds = new Set<string>()
  const seasonGroupMap = new Map<
    string,
    { id: string; seriesGroupId: string; season: number }
  >()

  for (const ep of episodes) {
    const seriesGroupId = makeSeriesGroupId(libraryId, ep.seriesName)
    seriesGroupIds.add(seriesGroupId)

    const seasonGroupId = makeSeasonGroupId(seriesGroupId, ep.info.season)
    if (!seasonGroupMap.has(seasonGroupId)) {
      seasonGroupMap.set(seasonGroupId, {
        id: seasonGroupId,
        seriesGroupId,
        season: ep.info.season,
      })
    }
  }

  // Fetch existing group IDs to avoid inserting duplicates
  const allGroupIds = [...seriesGroupIds, ...seasonGroupMap.keys()]
  const existingGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(inArray(groups.id, allGroupIds))
  const existingGroupIdSet = new Set(existingGroups.map((g) => g.id))

  // Insert missing series groups
  const seriesInserts: Array<typeof groups.$inferInsert> = []
  for (const seriesGroupId of seriesGroupIds) {
    if (!existingGroupIdSet.has(seriesGroupId)) {
      const seriesTitle = episodes.find(
        (e) => makeSeriesGroupId(libraryId, e.seriesName) === seriesGroupId,
      )?.seriesName
      if (seriesTitle) {
        seriesInserts.push({
          id: seriesGroupId,
          type: GroupType.Series,
          title: seriesTitle,
          parentGroupId: null,
          metadata: '{}',
          userId,
        })
      }
    }
  }
  if (seriesInserts.length > 0) {
    await db.insert(groups).values(seriesInserts)
  }

  // Insert missing season groups
  const seasonInserts: Array<typeof groups.$inferInsert> = []
  for (const [seasonGroupId, { seriesGroupId, season }] of seasonGroupMap) {
    if (!existingGroupIdSet.has(seasonGroupId)) {
      seasonInserts.push({
        id: seasonGroupId,
        type: GroupType.Season,
        title: `Season ${season}`,
        parentGroupId: seriesGroupId,
        metadata: '{}',
        userId,
      })
    }
  }
  if (seasonInserts.length > 0) {
    await db.insert(groups).values(seasonInserts)
  }

  // Fetch existing group members to avoid duplicates
  const episodeIds = episodes.map((e) => e.id)
  const existingMembers = await db
    .select({ mediaItemId: groupItems.mediaItemId })
    .from(groupItems)
    .where(inArray(groupItems.mediaItemId, episodeIds))
  const existingMemberSet = new Set(existingMembers.map((m) => m.mediaItemId))

  // Insert missing group members
  const memberInserts: Array<typeof groupItems.$inferInsert> = []
  for (const ep of episodes) {
    if (!existingMemberSet.has(ep.id)) {
      const seriesGroupId = makeSeriesGroupId(libraryId, ep.seriesName)
      const seasonGroupId = makeSeasonGroupId(seriesGroupId, ep.info.season)
      memberInserts.push({
        groupId: seasonGroupId,
        mediaItemId: ep.id,
        sortOrder: ep.info.episode,
      })
    }
  }
  if (memberInserts.length > 0) {
    await db.insert(groupItems).values(memberInserts)
  }
}

function makeAudiobookSeriesGroupId(
  libraryId: string,
  seriesTitle: string,
): string {
  return `grp:audiobook-series:${libraryId}:${seriesTitle}`
}

function makeAudiobookBookGroupId(
  libraryId: string,
  bookTitle: string,
): string {
  return `grp:book:${libraryId}:${bookTitle}`
}

interface AudiobookChapterData {
  id: string
  bookTitle: string
  narrator: string | null
  seriesName: string | null
  trackNumber: number
  fileName: string
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

function makeMusicArtistGroupId(libraryId: string, artistName: string): string {
  return `grp:artist:${libraryId}:${artistName}`
}

function makeMusicAlbumGroupId(
  libraryId: string,
  albumArtist: string,
  albumTitle: string,
): string {
  return `grp:album:${libraryId}:${albumArtist}:${albumTitle}`
}

interface MusicTrackData {
  id: string
  album: string
  artist: string
  trackNumber: number
  discNumber: number
}

/**
 * Auto-creates artist and album groups for Music media items in a library,
 * then assigns each track to its album group sorted by disc/track number.
 * Compilation albums (multiple artists) are grouped under "Various Artists".
 * Idempotent: safe to call after every scan.
 */
export async function groupMusicTracks(
  db: LibSQLDatabase,
  libraryId: string,
  userId: string,
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

  // Collect unique artist group IDs and album group entries
  const artistGroupIds = new Map<string, string>() // artistName → groupId
  const albumGroupMap = new Map<
    string,
    { id: string; albumArtist: string; albumTitle: string }
  >()

  for (const track of tracks) {
    const albumArtist = getAlbumArtist(track.album)
    if (!artistGroupIds.has(albumArtist)) {
      artistGroupIds.set(
        albumArtist,
        makeMusicArtistGroupId(libraryId, albumArtist),
      )
    }
    const albumGroupId = makeMusicAlbumGroupId(
      libraryId,
      albumArtist,
      track.album,
    )
    if (!albumGroupMap.has(albumGroupId)) {
      albumGroupMap.set(albumGroupId, {
        id: albumGroupId,
        albumArtist,
        albumTitle: track.album,
      })
    }
  }

  // Fetch existing groups to avoid duplicates
  const allGroupIds = [...artistGroupIds.values(), ...albumGroupMap.keys()]
  const existingGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(inArray(groups.id, allGroupIds))
  const existingGroupIdSet = new Set(existingGroups.map((g) => g.id))

  // Insert missing artist groups
  const artistInserts: Array<typeof groups.$inferInsert> = []
  for (const [artistName, artistGroupId] of artistGroupIds) {
    if (!existingGroupIdSet.has(artistGroupId)) {
      artistInserts.push({
        id: artistGroupId,
        type: GroupType.Artist,
        title: artistName,
        parentGroupId: null,
        metadata: '{}',
        userId,
      })
    }
  }
  if (artistInserts.length > 0) {
    await db.insert(groups).values(artistInserts)
  }

  // Insert missing album groups
  const albumInserts: Array<typeof groups.$inferInsert> = []
  for (const [albumGroupId, { albumArtist, albumTitle }] of albumGroupMap) {
    if (!existingGroupIdSet.has(albumGroupId)) {
      const artistGroupId = artistGroupIds.get(albumArtist) ?? null
      albumInserts.push({
        id: albumGroupId,
        type: GroupType.Album,
        title: albumTitle,
        parentGroupId: artistGroupId,
        metadata: '{}',
        userId,
      })
    }
  }
  if (albumInserts.length > 0) {
    await db.insert(groups).values(albumInserts)
  }

  // Fetch existing group members
  const trackIds = tracks.map((t) => t.id)
  const existingMembers = await db
    .select({ mediaItemId: groupItems.mediaItemId })
    .from(groupItems)
    .where(inArray(groupItems.mediaItemId, trackIds))
  const existingMemberSet = new Set(existingMembers.map((m) => m.mediaItemId))

  // Insert missing members — sort by disc * 1000 + trackNumber
  const memberInserts: Array<typeof groupItems.$inferInsert> = []
  for (const track of tracks) {
    if (!existingMemberSet.has(track.id)) {
      const albumArtist = getAlbumArtist(track.album)
      const albumGroupId = makeMusicAlbumGroupId(
        libraryId,
        albumArtist,
        track.album,
      )
      memberInserts.push({
        groupId: albumGroupId,
        mediaItemId: track.id,
        sortOrder: track.discNumber * 1000 + track.trackNumber,
      })
    }
  }
  if (memberInserts.length > 0) {
    await db.insert(groupItems).values(memberInserts)
  }
}

function makePhotoDateGroupId(libraryId: string, dateStr: string): string {
  return `grp:photo-date:${libraryId}:${dateStr}`
}

function makePhotoLocationGroupId(
  libraryId: string,
  lat: string,
  lon: string,
): string {
  return `grp:photo-location:${libraryId}:${lat}:${lon}`
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
 * Auto-creates date and location groups for Pictures/Images media items.
 * Date groups: one per unique day (EXIF DateTimeOriginal), photos sorted by time.
 * Location groups: one per GPS cluster (rounded to 1 decimal degree, ~11 km).
 * Idempotent: safe to call after every scan.
 */
export async function groupPhotos(
  db: LibSQLDatabase,
  libraryId: string,
  userId: string,
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

  // Build unique date groups
  const dateGroupMap = new Map<string, string>() // groupId → dateStr
  for (const photo of photos) {
    if (photo.dateStr) {
      const gid = makePhotoDateGroupId(libraryId, photo.dateStr)
      if (!dateGroupMap.has(gid)) {
        dateGroupMap.set(gid, photo.dateStr)
      }
    }
  }

  // Build unique location groups
  const locationGroupMap = new Map<string, { lat: string; lon: string }>()
  for (const photo of photos) {
    if (photo.latCluster !== null && photo.lonCluster !== null) {
      const gid = makePhotoLocationGroupId(
        libraryId,
        photo.latCluster,
        photo.lonCluster,
      )
      if (!locationGroupMap.has(gid)) {
        locationGroupMap.set(gid, {
          lat: photo.latCluster,
          lon: photo.lonCluster,
        })
      }
    }
  }

  const allGroupIds = [...dateGroupMap.keys(), ...locationGroupMap.keys()]
  if (allGroupIds.length === 0) return

  // Fetch existing groups to avoid duplicates
  const existingGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(inArray(groups.id, allGroupIds))
  const existingGroupIdSet = new Set(existingGroups.map((g) => g.id))

  // Insert missing date groups
  const dateInserts: Array<typeof groups.$inferInsert> = []
  for (const [gid, dateStr] of dateGroupMap) {
    if (!existingGroupIdSet.has(gid)) {
      dateInserts.push({
        id: gid,
        type: GroupType.PhotoDate,
        title: dateStr,
        parentGroupId: null,
        metadata: '{}',
        userId,
      })
    }
  }
  if (dateInserts.length > 0) {
    await db.insert(groups).values(dateInserts)
  }

  // Insert missing location groups
  const locationInserts: Array<typeof groups.$inferInsert> = []
  for (const [gid, { lat, lon }] of locationGroupMap) {
    if (!existingGroupIdSet.has(gid)) {
      locationInserts.push({
        id: gid,
        type: GroupType.PhotoLocation,
        title: `${lat}, ${lon}`,
        parentGroupId: null,
        metadata: JSON.stringify({ lat, lon }),
        userId,
      })
    }
  }
  if (locationInserts.length > 0) {
    await db.insert(groups).values(locationInserts)
  }

  // Fetch existing members to avoid duplicates (track by groupId:mediaItemId)
  const photoIds = photos.map((p) => p.id)
  const existingMembers = await db
    .select({
      groupId: groupItems.groupId,
      mediaItemId: groupItems.mediaItemId,
    })
    .from(groupItems)
    .where(inArray(groupItems.mediaItemId, photoIds))
  const existingMemberKeys = new Set(
    existingMembers.map((m) => `${m.groupId}:${m.mediaItemId}`),
  )

  // Insert missing memberships
  const memberInserts: Array<typeof groupItems.$inferInsert> = []
  for (const photo of photos) {
    if (photo.dateStr) {
      const gid = makePhotoDateGroupId(libraryId, photo.dateStr)
      const key = `${gid}:${photo.id}`
      if (!existingMemberKeys.has(key)) {
        memberInserts.push({
          groupId: gid,
          mediaItemId: photo.id,
          sortOrder: photo.timestamp,
        })
      }
    }
    if (photo.latCluster !== null && photo.lonCluster !== null) {
      const gid = makePhotoLocationGroupId(
        libraryId,
        photo.latCluster,
        photo.lonCluster,
      )
      const key = `${gid}:${photo.id}`
      if (!existingMemberKeys.has(key)) {
        memberInserts.push({
          groupId: gid,
          mediaItemId: photo.id,
          sortOrder: 0,
        })
      }
    }
  }
  if (memberInserts.length > 0) {
    await db.insert(groupItems).values(memberInserts)
  }
}
