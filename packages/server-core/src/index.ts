export { app } from "./app.js";
export { emitEvent, eventBus, type XonEvent } from "./events.js";
export { openDatabase, type LibSQLDatabase } from "./db.js";
export { migrateDatabase } from "./migrate.js";
export {
  libraries,
  dataSources,
  mediaItems,
  users,
  refreshTokens,
  libraryAccess,
  mediaProgress,
  favorites,
  watchlist,
  apiTokens,
  groups,
  groupMembers,
  type Library,
  type NewLibrary,
  type DataSource,
  type NewDataSource,
  type MediaItem,
  type NewMediaItem,
  type User,
  type NewUser,
  type RefreshToken,
  type NewRefreshToken,
  type LibraryAccess,
  type NewLibraryAccess,
  type MediaProgress,
  type NewMediaProgress,
  type Favorite,
  type NewFavorite,
  type Watchlist,
  type NewWatchlist,
  type ApiToken,
  type NewApiToken,
  type Group,
  type NewGroup,
  type GroupMember,
  type NewGroupMember,
} from "./schema.js";
export {
  parseTvEpisode,
  resolveSeriesName,
  groupTvEpisodes,
  groupMusicTracks,
  groupAudiobooks,
  resolveAudiobookInfo,
  type TvEpisodeInfo,
} from "./grouping.js";
export { hashPassword, verifyPassword } from "./password.js";
export {
  extractExiftoolMetadata,
  isImageCategory,
  type ExiftoolMetadata,
} from "./exiftool.js";
export {
  extractFfprobeMetadata,
  isAudioVideoCategory,
  type FfprobeMetadata,
} from "./ffprobe.js";
export {
  extractMusicTags,
  isMusicCategory,
  type MusicTagsMetadata,
} from "./musictags.js";
export {
  extractDocumentMetadata,
  extractFontMetadata,
  extract3DModelMetadata,
  extractArchiveMetadata,
  isDocumentCategory,
  isFontCategory,
  is3DModelCategory,
  isArchiveCategory,
  type DocumentMetadata,
  type FontMetadata,
  type Model3DMetadata,
  type ArchiveMetadata,
} from "./miscmeta.js";
export { detectDrm } from "./drm.js";
export { generateThumbnails, type ThumbnailPaths } from "./thumbnails.js";
export { generateVideoThumbnails, isVideoCategory } from "./videoThumbnails.js";
export { scanDataSource, type FileEntry, type ScanResult } from "./scanner.js";
export { scanLibrary, type ScanProgress, type ScanSummary } from "./orchestrator.js";
export { boot } from "./server.js";
export {
  startScheduler,
  parseCronInterval,
  type TriggerFn,
  type SchedulerHandle,
} from "./scheduler.js";
export {
  discoverPluginManifests,
  type PluginLoadResult,
} from "./pluginLoader.js";
export {
  discoverAndActivatePlugins,
  activatePlugin,
  deactivatePlugin,
  uninstallPlugin,
  loadPlugin,
  emitPluginEvent,
  setPluginDatabase,
  registry as pluginRegistry,
  type PluginEntry,
  type PluginStatus,
} from "./pluginManager.js";
