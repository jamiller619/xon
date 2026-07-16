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
  process: {
    /** CPU usage as a % of total capacity across all cores, same scale as `cpu` */
    cpu: number
    /** Resident set size, in bytes */
    memory: number
    /** Seconds since the server process started */
    uptime: number
  }
  system: {
    model: string
    manufacturer: string
    platform: string
    release: string
    hostname: string
  }
}

const pluginCategories = [
  'MediaProvider',
  'MetadataSource',
  'FormatHandler',
  'Theme',
  // | 'FormatHandler'
  // | 'Processor'
  // | 'Theme'
  // | 'UIExtension'
  // | 'BackupTarget'
] as const
export type PluginCategory = (typeof pluginCategories)[number]

export const PLUGIN_CATEGORIES = new Set(pluginCategories)

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
  TVShows = 'tv_shows',
  Music = 'music',
  Photos = 'photos',
  HomeVideos = 'home_videos',
  VideoClips = 'video_clips',
}

export interface Library {
  id: string
  createdAt: Date
  updatedAt: Date | null
  ownerId: string
  name: string
  description: string | null
  type: LibraryType
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
// export type Metadata<T = Record<string, any>> = T & {
//   images?: {
//     backdrop?: string[] | string
//     poster?: string[] | string
//     thumbnail?: string[] | string
//     logo?: string[] | string
//   }
// }

// biome-ignore lint/suspicious/noExplicitAny: any is correct
export type Metadata = Record<string, any>

// export type MetadataMovie = Metadata<{
//   title: string
//   releaseDate?: string
//   rating?: MPARating
//   genres?: string[]
//   cast?: CastMember[]
//   director?: string
//   duration?: number
// }>

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
  fileMetadata: Metadata
  mediaType: string
  matchId: string | null
  matchIdSource: string | null
  title: string
  description: string | null
  metadata: Metadata
  drmProtected: boolean
  scannedAt: Date
  tags: string[]
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

export type PageProps = {
  pageNumber: number
  pageSize: number
}

export type SortProps<T> = {
  field: keyof T
  order: 'asc' | 'desc'
}
