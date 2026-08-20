import type { MediaItem, PosterInput } from '@xon/shared'

export type MusicArtwork = {
  id: string
  metadata: { images?: { poster?: PosterInput } }
  updatedAt: string | null
}

export type MusicGroup = {
  id: string
  title: string
  createdAt: string
  songCount: number
  artwork: MusicArtwork | null
  artist?: string
  albumCount?: number
}

export type MusicSummary = {
  albums: MusicGroup[]
  artists: MusicGroup[]
}

export type MusicAlbumDetail = MusicGroup & {
  artist: string
  tracks: MediaItem[]
}
