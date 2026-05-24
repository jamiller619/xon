export { app } from './app.js'
export { hashPassword, verifyPassword } from './auth/password.js'
export type { LibSQLDatabase } from './db/db.js'
export { migrateDatabase } from './db/migrate.js'
export {
  type AiMode,
  type AiSettingsRow,
  // type ApiToken,
  aiSettings,
  // apiTokens,
  type BackupFileState,
  type BackupJob,
  type BackupTarget,
  type BackupVerifyJob,
  backupFileState,
  backupJobs,
  backupTargets,
  backupVerifyJobs,
  // type DataSource,
  type DuplicateCandidate,
  // dataSources,
  duplicateCandidates,
  // type Favorite,
  // favorites,
  type Group,
  type GroupMember,
  groupItems,
  groups,
  type ImageHash,
  imageHashes,
  type Library,
  // type LibraryAccess,
  libraries,
  // libraryAccess,
  type MatchingQueueItem,
  type MediaItem,
  type MediaProgress,
  matchingQueue,
  mediaItems,
  mediaProgress,
  type NewAiSettings,
  // type NewApiToken,
  type NewBackupFileState,
  type NewBackupJob,
  type NewBackupTarget,
  type NewBackupVerifyJob,
  // type NewDataSource,
  type NewDuplicateCandidate,
  // type NewFavorite,
  type NewGroup,
  type NewGroupMember,
  type NewImageHash,
  type NewLibrary,
  // type NewLibraryAccess,
  type NewMatchingQueueItem,
  type NewMediaItem,
  type NewMediaProgress,
  // type NewRefreshToken,
  type NewSuggestedGroup,
  type NewSyncProfile,
  type NewSyncRun,
  // type NewUser,
  // type NewWatchlist,
  // type RefreshToken,
  // refreshTokens,
  type SuggestedGroup,
  type SyncProfile,
  type SyncRun,
  suggestedGroups,
  syncProfiles,
  syncRuns,
  // type User,
  users,
  // type Watchlist,
  // watchlist,
} from './db/schema.js'
export { emitEvent, eventBus, type XonEvent } from './events.js'
export {
  type AutoTag,
  type AutoTagOnnxSession,
  autoTagMediaItems,
  computeDocumentTags,
  computeImageTags,
  getAutoTagOnnxSession,
  setAutoTagOnnxSession,
} from './media/autoTag.js'
export { detectDrm } from './media/drm.js'
export {
  type ExiftoolMetadata,
  extractExiftoolMetadata,
  isImageCategory,
} from './media/exiftool.js'
export {
  extractFfprobeMetadata,
  type FfprobeMetadata,
  isAudioVideoCategory,
} from './media/ffprobe.js'
export {
  computeMatchScore,
  type FuzzyMatchConfig,
  getOnnxSession,
  jaroWinkler,
  type MatchCandidate,
  type MatchResult,
  matchMediaFile,
  ngramSimilarity,
  type OnnxInferenceSession,
  parseFilenameInfo,
  setOnnxSession,
} from './media/fuzzyMatch.js'
export {
  clusterCoordinate,
  groupMusicTracks,
  groupPhotos,
  groupTvEpisodes,
  parseExifDate,
  parseExifTimestamp,
  parseTvEpisode,
  // groupAudiobooks,
  resolveAudiobookInfo,
  resolveSeriesName,
  type TvEpisodeInfo,
} from './media/grouping.js'
export {
  type ArchiveMetadata,
  // isDocumentCategory,
  // isFontCategory,
  // is3DModelCategory,
  // isArchiveCategory,
  type DocumentMetadata,
  extract3DModelMetadata,
  extractArchiveMetadata,
  extractDocumentMetadata,
  extractFontMetadata,
  type FontMetadata,
  type Model3DMetadata,
} from './media/miscmeta.js'
export {
  extractMusicTags,
  isMusicCategory,
  type MusicTagsMetadata,
} from './media/musictags.js'
export {
  computePerceptualHash,
  getPerceptualHashOnnxSession,
  hammingDistance,
  hashSimilarity,
  type PerceptualHashConfig,
  type PerceptualHashOnnxSession,
  scanLibraryForDuplicates,
  setPerceptualHashOnnxSession,
} from './media/perceptualHash.js'
export {
  acceptSuggestedGroup,
  detectMultiDiscAlbums,
  // detectBookSeries,
  // detectSupplementaryMaterials,
  type SmartGroupCandidate,
  scanLibraryForSmartGroups,
} from './media/smartGrouping.js'
export { generateThumbnails } from './media/thumbnails.js'
export {
  generateVideoThumbnails,
  isVideoCategory,
} from './media/videoThumbnails.js'
export {
  getBackupTargetPlugin,
  registerBackupTargetPlugin,
  unregisterBackupTargetPlugin,
} from './plugins/backupTargetPluginRegistry.js'
export {
  getMediaProviderPlugin,
  registerMediaProviderPlugin,
  unregisterMediaProviderPlugin,
} from './plugins/mediaProviderPluginRegistry.js'
export {
  discoverPluginManifests,
  type PluginLoadResult,
} from './plugins/pluginLoader.js'
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
} from './plugins/pluginManager.js'
export { runMediaBackupJob } from './routes/adminBackupMedia.js'
export {
  copyFilesToDestination,
  type LocalBackupConfig,
  type NetworkBackupConfig,
  type PluginBackupConfig,
  runBackupToTarget,
} from './routes/adminBackupTargets.js'
export { computeChecksum, runVerifyJob } from './routes/adminBackupVerify.js'
export { runSyncJob } from './routes/sync.js'
export {
  type ScanResult,
  scanDataSource,
} from './scanner/scanner.js'
export {
  parseCronInterval,
  type SchedulerHandle,
  startScheduler,
  type TriggerFn,
} from './scanner/scheduler.js'
// export {
//   scanLibrary,
//   type ScanProgress,
//   type ScanSummary,
// } from './scanner/orchestrator.old.js'
export { boot } from './server.js'
