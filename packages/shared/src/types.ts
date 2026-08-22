export type StatsPayload = {
  app: {
    version: string
  }
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

export enum CollectionType {
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

export type Collection = {
  id: string
  createdAt: Date
  updatedAt: Date | null
  type: CollectionType
  title: string
  parentCollectionId?: string | null
  // biome-ignore lint/suspicious/noExplicitAny: valid
  metadata: Record<string, any>
  mediaItems?: MediaItem[]
}

export const ContentTypeMain = {
  // These coorespond to the top-level name in a mime type,
  // or content type.
  Audio: 'audio',
  Application: 'application',
  Font: 'font',
  Image: 'image',
  Video: 'video',
  Text: 'text',
  Model: 'model',
} as const

export type ContentTypeMain =
  (typeof ContentTypeMain)[keyof typeof ContentTypeMain]

// Used to represent a sub-type of a content type, e.g.
// `video/movie` or `audio/song`
export type SpecializedContentType = `${ContentTypeMain}/${string}`

export type ContentType = ContentTypeMain | SpecializedContentType

export interface Library {
  id: string
  createdAt: Date
  updatedAt: Date | null
  ownerId: string
  name: string
  description: string | null
  type: ContentType
  scanSchedule: string | null
  dataSources: DataSource[]
  images: {
    poster: string[]
  }
}

export interface LibraryStats {
  totalItems: number
  totalSize: number
}

export enum DataSourceType {
  local = 'local',
  plugin = 'plugin',
}

export interface DataSource {
  id: string
  pluginId?: string | null | undefined
  type: DataSourceType
  path: string
  watchEnabled?: boolean | undefined
}

export const MPARatings = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'] as const

export type MPARating = (typeof MPARatings)[number]

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

/** The three generated sizes for a single image, in pixels of the long edge. */
export interface ThumbnailSet {
  small: string
  medium: string
  large: string
}

/**
 * A poster (or other artwork) entry: the source image plus any locally
 * generated thumbnails of *that same* image, so thumbnails stay tied to the
 * image they were derived from. A media item may carry more than one.
 */
export interface PosterImage {
  src: string
  thumbnails?: ThumbnailSet
}

/** Anything historically stored under `images.poster` (legacy or current). */
export type PosterInput =
  | string
  | PosterImage
  | Array<string | PosterImage>
  | undefined
  | null

/** Normalize a bare URL string into a {@link PosterImage}. */
export function toPosterImage(entry: string | PosterImage): PosterImage {
  return typeof entry === 'string' ? { src: entry } : entry
}

/** All poster entries as normalized {@link PosterImage} objects. */
export function posterImages(poster: PosterInput): PosterImage[] {
  if (!poster) return []
  const list = Array.isArray(poster) ? poster : [poster]
  return list.filter(Boolean).map(toPosterImage)
}

/**
 * Best display URL for the first poster. Prefers the requested thumbnail
 * size when present, otherwise falls back to the full-size `src`. Tolerant of
 * legacy string/string[] values so existing rows keep rendering.
 */
export function posterUrl(
  poster: PosterInput,
  size?: keyof ThumbnailSet,
): string | undefined {
  const first = posterImages(poster)[0]
  if (!first) return undefined
  if (size && first.thumbnails?.[size]) return first.thumbnails[size]
  return first.src
}

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
  character?: string
  description?: string | null
  avatarUrl?: string | null
  metadata?: Record<string, unknown>
  role?: string
  order?: number | null
}

export interface MediaItem {
  id: string
  libraryId: string
  dataSourceId: string | null
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

export interface User {
  id: string
  username: string
  email: string
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

export type PlayState = {
  userId: string
  mediaItemId: string
  mediaItem?: MediaItem
  position: number
  duration?: number
  status: 'playing' | 'stopped' | 'completed'
  startedAt: Date
  updatedAt: Date
  stoppedAt?: Date
}

export type MediaPlayProgress = Pick<
  PlayState,
  'mediaItemId' | 'position' | 'status'
> & {
  duration: number | null
}
