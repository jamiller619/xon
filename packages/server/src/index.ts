export { app } from './app.ts'
export type { LibSQLDatabase } from './db/db.ts'
export { migrateDatabase } from './db/migrate.ts'
export {
  type Collection,
  type CollectionMember,
  collectionItems,
  collections,
  type Library,
  libraries,
  type MediaItem,
  mediaItems,
  type NewCollection,
  type NewCollectionMember,
  type NewLibrary,
  type NewMediaItem,
  users,
} from './db/schema.ts'
export { emitEvent, eventBus, type XonEvent } from './events.ts'
export {
  clusterCoordinate,
  createMusicCollections,
  createPhotoCollections,
  createTvCollections,
  parseExifDate,
  parseExifTimestamp,
  parseTvEpisode,
  resolveAudiobookInfo,
  resolveSeriesName,
  type TvEpisodeInfo,
} from './media/collections.ts'
export { detectDrm } from './media/drm.ts'
export {
  type ExiftoolMetadata,
  extractExiftoolMetadata,
} from './media/exiftool.ts'
export {
  extractFfprobeMetadata,
  type FfprobeMetadata,
} from './media/ffprobe.ts'
export { generateThumbnails } from './media/thumbnails.ts'
export {
  generateVideoBackdrops,
  generateVideoPosters,
  generateVideoThumbnails,
} from './media/videoThumbnails.ts'
export {
  getMediaProviderPlugin,
  registerMediaProviderPlugin,
  unregisterMediaProviderPlugin,
} from './plugins/mediaProviderPluginRegistry.ts'
export {
  discoverPluginManifests,
  type PluginLoadResult,
} from './plugins/pluginLoader.ts'
export {
  activatePlugin,
  deactivatePlugin,
  discoverAndActivatePlugins,
  emitPluginEvent,
  loadPlugin,
  type PluginEntry,
  type PluginStatus,
  registry as pluginRegistry,
  setPluginDatabase,
  uninstallPlugin,
} from './plugins/pluginManager.ts'
export type { CollectionsRoutes } from './routes/collections.ts'
export type { LibrariesRoutes } from './routes/libraries.ts'
export type { ScanResult } from './scanner/scanner.ts'
export {
  parseCronInterval,
  type SchedulerHandle,
  startScheduler,
  type TriggerFn,
} from './scanner/scheduler.ts'
export { boot } from './server.ts'
