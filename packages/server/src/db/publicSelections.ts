import { libraries, mediaItems, people } from './schema.ts'

export const publicLibraryColumns = {
  id: libraries.publicId,
  createdAt: libraries.createdAt,
  updatedAt: libraries.updatedAt,
  name: libraries.name,
  description: libraries.description,
  type: libraries.type,
  scanSchedule: libraries.scanSchedule,
  dataSources: libraries.dataSources,
  images: libraries.images,
}

export const publicMediaColumns = {
  id: mediaItems.publicId,
  createdAt: mediaItems.createdAt,
  updatedAt: mediaItems.updatedAt,
  dataSourceId: mediaItems.dataSourceId,
  matchId: mediaItems.matchId,
  matchIdSource: mediaItems.matchIdSource,
  filePath: mediaItems.filePath,
  fileSize: mediaItems.fileSize,
  fileMetadata: mediaItems.fileMetadata,
  mediaType: mediaItems.mediaType,
  title: mediaItems.title,
  description: mediaItems.description,
  metadata: mediaItems.metadata,
  drmProtected: mediaItems.drmProtected,
  scannedAt: mediaItems.scannedAt,
  tags: mediaItems.tags,
}

export const publicPersonColumns = {
  id: people.publicId,
  name: people.name,
  description: people.description,
  avatarUrl: people.avatarUrl,
  metadata: people.metadata,
}
