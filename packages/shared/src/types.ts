export type StatsPayload = {
  cpu: number
  memory: {
    used: number
    total: number
    free: number
  }
  disk: {
    fs: string
    used: number
    size: number
  }[]
  timestamp: number
  uptime: number
  system: {
    model: string
    manufacturer: string
    platform: string
    release: string
    hostname: string
  }
}

export enum GroupType {
  Series = 'series',
  Season = 'season',
  Album = 'album',
  Artist = 'artist',
  BookSeries = 'book_series',
  Collection = 'collection',
  Favorites = 'favorites',
  Watchlist = 'watchlist',
  Playlist = 'playlist',
  Shelf = 'shelf',
  Folder = 'folder',
  PhotoLocation = 'photo_location',
  PhotoDate = 'photo_date',
}

export type Group = {
  id: string
  createdAt: Date
  updatedAt: Date | null
  type: GroupType
  title: string
  parentGroupID?: string | null
  // biome-ignore lint/suspicious/noExplicitAny: valid
  metadata: Record<string, any>
  mediaItems?: MediaItem[]
}

export enum LibraryType {
  Movies = 'movies',
  TVShows = 'series',
  Music = 'music',
  Photos = 'photos',
  HomeVideos = 'home_videos',
}

export interface Library {
  id: string
  createdAt: Date
  updatedAt: Date | null
  name: string
  description: string | null
  types: LibraryType[]
  scanSchedule: string | null
  dataSources: DataSource[]
}

export enum DataSourceType {
  local = 'local',
  plugin = 'plugin',
}

export interface DataSource {
  pluginId?: string | null | undefined
  type: DataSourceType
  path: string
  watchEnabled?: boolean | undefined
}

export const MPARatings = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'] as const

export type MPARating = (typeof MPARatings)[number]

// biome-ignore lint/suspicious/noExplicitAny: We want <any>
export type Metadata<T = Record<string, any>> = T & {
  images?: {
    backdrop?: string[] | string
    poster?: string[] | string
    thumbnail?: string[] | string
    logo?: string[] | string
  }
}

export type MetadataMovie = Metadata<{
  title: string
  releaseDate?: string
  rating?: MPARating
  genres?: string[]
  cast?: CastMember[]
  director?: string
  duration?: number
}>

export interface CastMember {
  id: string
  name: string
  description?: string | null
  avatarUrl?: string | null
  metadata: Record<string, unknown>
  role: string
  order?: number | null
}

export interface MediaItem {
  id: string
  createdAt: Date
  updatedAt: Date | null
  filePath: string
  fileSize: number
  mediaType: string
  title: string
  description: string | null
  metadata: Metadata
  drmProtected: boolean
  scannedAt: Date
  genres: string[]

  // video mediaType
  cast?: CastMember[]
}

export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

export interface User {
  id: string
  username: string
  email: string
  role: UserRole
  createdAt: Date
  updatedAt: Date
}
