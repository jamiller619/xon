export enum MediaCategory {
  Movies = 'Movies',
  TVShows = 'TV Shows',
  Clips = 'Clips',
  Music = 'Music',
  Audiobooks = 'Audiobooks',
  AudioClips = 'Audio Clips',
  Podcasts = 'Podcasts',
  Pictures = 'Pictures',
  Images = 'Images',
  Textures = 'Textures',
  HomeVideos = 'Home Videos',
  Games = 'Games',
  InteractiveMedia = 'Interactive Media',
  Documents = 'Documents',
  WebMedia = 'Web Media',
  DesignFiles = 'Design Files',
  Models3D = '3D Models',
  Archives = 'Archives',
  Fonts = 'Fonts',
  Icons = 'Icons',
}
export interface Library {
  id: string
  createdAt: Date
  updatedAt: Date | null
  name: string
  description: string | null
  mediaTypes: MediaCategory[]
  scanSchedule: string | null
  watchEnabled: boolean
  lastScanResult: string | null
  lastScanDuration: number | null
  hideDRMItems: boolean
  dataSources?: DataSource[]
}

export type DataSourceType = 'local' | 'network' | 'plugin'

export interface DataSource {
  id: string
  libraryId: string
  pluginId: string | null
  type: DataSourceType
  path: string
  // recursive: boolean
  // enabled: boolean
  createdAt: Date
  updatedAt: Date | null
}

export const MPARatings = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'] as const

export type MPARating = (typeof MPARatings)[number]

export const MediaImageTypes = ['poster', 'backdrop', 'thumbnail'] as const

export type MediaImageType = (typeof MediaImageTypes)[number]

export type MediaImage = {
  url: string
  type: MediaImageType
  mediaItemId: string
}

export interface MediaItem {
  id: string
  createdAt: Date
  updatedAt: Date | null
  libraryId: string
  // dataSourceId: string
  filePath: string
  fileName: string
  fileSize: number
  mimeType: string
  mediaCategory: MediaCategory
  title: string | null
  description: string | null
  metadata: Record<string, unknown>
  drmProtected: boolean
  scannedAt: Date
  images?: MediaImage[]
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
