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
  network: {
    iface: string
    rx: number
    rxSec: number
    tx: number
    txSec: number
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

export interface Library {
  id: string
  createdAt: Date
  updatedAt: Date | null
  name: string
  description: string | null
  mediaCategories: MediaCategory[]
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
  createdAt: Date
  updatedAt: Date | null
}

export const MPARatings = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'] as const

export type MPARating = (typeof MPARatings)[number]

// biome-ignore lint/suspicious/noExplicitAny: We want <any>
export type Metadata<T = Record<string, any>> = T & {
  images?: {
    backdrop?: string[] | string
    poster?: string[] | string
    thumbnail?: string[] | string
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
