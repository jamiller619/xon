import type { MediaCategory } from './constants.js'
import type { UserRole } from './constants.js'

export interface Library {
  id: string
  name: string
  description: string | null
  allowedMediaTypes: MediaCategory[]
  createdAt: Date
  updatedAt: Date
}

export interface DataSource {
  id: string
  libraryId: string
  type: 'local' | 'network'
  path: string
  recursive: boolean
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface MediaItem {
  id: string
  libraryId: string
  dataSourceId: string
  filePath: string
  fileName: string
  fileSize: number
  mimeType: string
  mediaCategory: MediaCategory
  title: string | null
  description: string | null
  metadata: Record<string, unknown>
  drmProtected: boolean
  createdAt: Date
  updatedAt: Date
  scannedAt: Date
}

export interface User {
  id: string
  username: string
  email: string
  role: UserRole
  createdAt: Date
  updatedAt: Date
}
