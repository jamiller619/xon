import { MediaType } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { MediaItem } from '../db/schema.ts'
import * as libraryService from './libraryService.ts'

type MusicArtwork = Pick<MediaItem, 'id' | 'metadata' | 'updatedAt'>

export type MusicAlbumSummary = {
  id: string
  title: string
  artist: string
  songCount: number
  createdAt: Date
  artwork: MusicArtwork | null
}

export type MusicArtistSummary = {
  id: string
  title: string
  albumCount: number
  songCount: number
  createdAt: Date
  artwork: MusicArtwork | null
}

export type MusicAlbumDetail = MusicAlbumSummary & {
  tracks: MediaItem[]
}

type MutableArtistSummary = MusicArtistSummary & {
  albumIds: Set<string>
}

type MutableAlbumSummary = MusicAlbumSummary & {
  artistCounts: Map<string, number>
}

const PLAYLIST_MEDIA_TYPES = new Set(['audio/mpegurl', 'audio/x-mpegurl'])

function metadataText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function musicTag(
  item: MediaItem,
  key: 'album' | 'albumArtist' | 'artist',
  fallback: string,
): string {
  return metadataText(
    item.fileMetadata[key],
    metadataText(item.metadata[key], fallback),
  )
}

function normalizedMusicKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

function albumIdForItem(item: MediaItem): string {
  const artistName = musicTag(item, 'artist', 'Unknown Artist')
  const albumTitle = musicTag(item, 'album', 'Unknown Album')
  const albumArtist = musicTag(
    item,
    'albumArtist',
    primaryTrackArtist(artistName),
  )

  return JSON.stringify([
    normalizedMusicKey(albumTitle),
    normalizedMusicKey(albumArtist),
  ])
}

function musicNumber(
  item: MediaItem,
  key: 'discNumber' | 'trackNumber',
): number {
  const value = item.fileMetadata[key] ?? item.metadata[key]
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER
}

function primaryTrackArtist(value: string): string {
  const [primary] = value.split(/\s*(?:,|;|\bfeat(?:uring)?\.?\b)\s*/i, 1)
  return primary?.trim() || value
}

function artwork(item: MediaItem): MusicArtwork {
  return {
    id: item.id,
    metadata: item.metadata,
    updatedAt: item.updatedAt,
  }
}

function hasArtwork(item: MusicArtwork | null): boolean {
  const poster = item?.metadata.images?.poster
  return Array.isArray(poster) ? poster.length > 0 : Boolean(poster)
}

function preferredArtwork(
  current: MusicArtwork | null,
  candidate: MediaItem,
): MusicArtwork {
  return current && hasArtwork(current) ? current : artwork(candidate)
}

export function summarizeMusicItems(items: readonly MediaItem[]) {
  const albums = new Map<string, MutableAlbumSummary>()
  const artists = new Map<string, MutableArtistSummary>()

  for (const item of items) {
    if (PLAYLIST_MEDIA_TYPES.has(item.mediaType)) continue

    const artistName = musicTag(item, 'artist', 'Unknown Artist')
    const artistId = normalizedMusicKey(artistName)
    const albumTitle = musicTag(item, 'album', 'Unknown Album')
    const albumId = albumIdForItem(item)
    const album = albums.get(albumId)

    if (album) {
      album.songCount += 1
      const artistSongCount = (album.artistCounts.get(artistId) ?? 0) + 1
      album.artistCounts.set(artistId, artistSongCount)
      const currentArtistCount =
        album.artistCounts.get(normalizedMusicKey(album.artist)) ?? 0
      if (artistSongCount > currentArtistCount) album.artist = artistName
      if (item.createdAt > album.createdAt) album.createdAt = item.createdAt
      album.artwork = preferredArtwork(album.artwork, item)
    } else {
      albums.set(albumId, {
        id: albumId,
        title: albumTitle,
        artist: artistName,
        songCount: 1,
        createdAt: item.createdAt,
        artwork: artwork(item),
        artistCounts: new Map([[artistId, 1]]),
      })
    }

    const artist = artists.get(artistId)
    if (artist) {
      artist.songCount += 1
      artist.albumIds.add(albumId)
      artist.albumCount = artist.albumIds.size
      if (item.createdAt > artist.createdAt) artist.createdAt = item.createdAt
      artist.artwork = preferredArtwork(artist.artwork, item)
    } else {
      artists.set(artistId, {
        id: artistId,
        title: artistName,
        albumCount: 1,
        songCount: 1,
        createdAt: item.createdAt,
        artwork: artwork(item),
        albumIds: new Set([albumId]),
      })
    }
  }

  return {
    albums: [...albums.values()].map(
      ({ artistCounts: _artistCounts, ...album }) => album,
    ),
    artists: [...artists.values()].map(
      ({ albumIds: _albumIds, ...artist }) => artist,
    ),
  }
}

export async function getMusicLibrarySummary(
  db: LibSQLDatabase,
  libraryId: string,
) {
  const items = await libraryService.getMediaByTypeAndLibraryId(
    db,
    MediaType.MainType.Audio,
    libraryId,
  )
  return summarizeMusicItems(items)
}

export async function getMusicAlbumDetail(
  db: LibSQLDatabase,
  libraryId: string,
  albumId: string,
): Promise<MusicAlbumDetail | null> {
  const items = await libraryService.getMediaByTypeAndLibraryId(
    db,
    MediaType.MainType.Audio,
    libraryId,
  )
  const album = summarizeMusicItems(items).albums.find(
    (item) => item.id === albumId,
  )

  if (!album) return null

  const tracks = items
    .filter(
      (item) =>
        !PLAYLIST_MEDIA_TYPES.has(item.mediaType) &&
        albumIdForItem(item) === albumId,
    )
    .sort((left, right) => {
      const disc =
        musicNumber(left, 'discNumber') - musicNumber(right, 'discNumber')
      if (disc !== 0) return disc

      const track =
        musicNumber(left, 'trackNumber') - musicNumber(right, 'trackNumber')
      if (track !== 0) return track

      const title = left.title.localeCompare(right.title, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
      return title || left.id.localeCompare(right.id)
    })

  return { ...album, tracks }
}
