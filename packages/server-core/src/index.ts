export { app } from './app.js'
export { emitEvent, eventBus, type XonEvent } from './events.js'
export { openDatabase, type LibSQLDatabase } from './db/db.js'
export { migrateDatabase } from './db/migrate.js'
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
  matchingQueue,
  type MatchingQueueItem,
  type NewMatchingQueueItem,
  imageHashes,
  type ImageHash,
  type NewImageHash,
  duplicateCandidates,
  type DuplicateCandidate,
  type NewDuplicateCandidate,
  suggestedGroups,
  type SuggestedGroup,
  type NewSuggestedGroup,
  aiSettings,
  type AiSettingsRow,
  type NewAiSettings,
  type AiMode,
  backupTargets,
  type BackupTarget,
  type NewBackupTarget,
  backupJobs,
  type BackupJob,
  type NewBackupJob,
  backupFileState,
  type BackupFileState,
  type NewBackupFileState,
  backupVerifyJobs,
  type BackupVerifyJob,
  type NewBackupVerifyJob,
  syncProfiles,
  type SyncProfile,
  type NewSyncProfile,
  syncRuns,
  type SyncRun,
  type NewSyncRun,
} from './db/schema.js'
export {
  parseTvEpisode,
  resolveSeriesName,
  groupTvEpisodes,
  groupMusicTracks,
  groupAudiobooks,
  resolveAudiobookInfo,
  groupPhotos,
  parseExifDate,
  parseExifTimestamp,
  clusterCoordinate,
  type TvEpisodeInfo,
} from './media/grouping.js'
export {
  matchMediaFile,
  computeMatchScore,
  parseFilenameInfo,
  jaroWinkler,
  ngramSimilarity,
  setOnnxSession,
  getOnnxSession,
  type MatchCandidate,
  type MatchResult,
  type FuzzyMatchConfig,
  type OnnxInferenceSession,
} from './media/fuzzyMatch.js'
export {
  autoTagMediaItems,
  computeDocumentTags,
  computeImageTags,
  getAutoTagOnnxSession,
  setAutoTagOnnxSession,
  type AutoTag,
  type AutoTagOnnxSession,
} from './media/autoTag.js'
export {
  computePerceptualHash,
  hammingDistance,
  hashSimilarity,
  scanLibraryForDuplicates,
  setPerceptualHashOnnxSession,
  getPerceptualHashOnnxSession,
  type PerceptualHashConfig,
  type PerceptualHashOnnxSession,
} from './media/perceptualHash.js'
export {
  scanLibraryForSmartGroups,
  acceptSuggestedGroup,
  detectMultiDiscAlbums,
  detectBookSeries,
  detectSupplementaryMaterials,
  type SmartGroupCandidate,
} from './media/smartGrouping.js'
export { hashPassword, verifyPassword } from './auth/password.js'
export {
  copyFilesToDestination,
  runBackupToTarget,
  type LocalBackupConfig,
  type NetworkBackupConfig,
  type PluginBackupConfig,
} from './routes/adminBackupTargets.js'
export {
  registerBackupTargetPlugin,
  getBackupTargetPlugin,
  unregisterBackupTargetPlugin,
} from './plugins/backupTargetPluginRegistry.js'
export {
  registerMediaProviderPlugin,
  getMediaProviderPlugin,
  unregisterMediaProviderPlugin,
} from './plugins/mediaProviderPluginRegistry.js'
export { runMediaBackupJob } from './routes/adminBackupMedia.js'
export { runVerifyJob, computeChecksum } from './routes/adminBackupVerify.js'
export { runSyncJob } from './routes/sync.js'
export {
  extractExiftoolMetadata,
  isImageCategory,
  type ExiftoolMetadata,
} from './media/exiftool.js'
export {
  extractFfprobeMetadata,
  isAudioVideoCategory,
  type FfprobeMetadata,
} from './media/ffprobe.js'
export {
  extractMusicTags,
  isMusicCategory,
  type MusicTagsMetadata,
} from './media/musictags.js'
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
} from './media/miscmeta.js'
export { detectDrm } from './media/drm.js'
export { generateThumbnails, type ThumbnailPaths } from './media/thumbnails.js'
export {
  generateVideoThumbnails,
  isVideoCategory,
} from './media/videoThumbnails.js'
export {
  scanDataSource,
  type FileEntry,
  type ScanResult,
} from './scanner/scanner.js'
export {
  scanLibrary,
  type ScanProgress,
  type ScanSummary,
} from './scanner/orchestrator.js'
export { boot } from './server.js'
export {
  startScheduler,
  parseCronInterval,
  type TriggerFn,
  type SchedulerHandle,
} from './scanner/scheduler.js'
export {
  discoverPluginManifests,
  type PluginLoadResult,
} from './plugins/pluginLoader.js'
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
} from './plugins/pluginManager.js'
