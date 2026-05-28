import type { MediaCategory } from './mediaCategories.js'

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
  Series = 'Series',
  Season = 'Season',
  Album = 'Album',
  Artist = 'Artist',
  BookSeries = 'Book Series',
  Collection = 'Collection',
  Favorites = 'Favorites',
  Watchlist = 'Watchlist',
  Playlist = 'Playlist',
  Shelf = 'Shelf',
  Folder = 'Folder',
  PhotoLocation = 'Photo Location',
  PhotoDate = 'Photo Date',
}

export type Group = {
  id: string
  createdAt: Date
  updatedAt: Date | null
  type: GroupType
  title: string
  parentCollectionId?: string | null
  // biome-ignore lint/suspicious/noExplicitAny: valid
  metadata: Record<string, any>
  mediaItems?: MediaItem[]
}

export interface Library {
  id: string
  createdAt: Date
  updatedAt: Date | null
  name: string
  description: string | null
  mediaCategories: MediaCategory[]
  scanSchedule: string | null
  dataSources: DataSource[]
}

export enum DataSourceType {
  local = 'local',
  network = 'network',
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

export interface MediaItem {
  id: string
  createdAt: Date
  updatedAt: Date | null
  libraryId: string
  filePath: string
  fileSize: number
  mimeType: string
  title: string
  description: string | null
  metadata: Metadata
  drmProtected: boolean
  scannedAt: Date
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
