export { app } from './app.ts'
// export { hashPassword, verifyPassword } from './auth/password.ts'
export type { LibSQLDatabase } from './db/db.ts'
export { migrateDatabase } from './db/migrate.ts'
export {
  // type AiMode,
  // type AiSettingsRow,
  // type ApiToken,
  // aiSettings,
  // apiTokens,
  // type BackupFileState,
  // type BackupJob,
  // type BackupTarget,
  // type BackupVerifyJob,
  // backupFileState,
  // backupJobs,
  // backupTargets,
  // backupVerifyJobs,
  // type DataSource,
  // type DuplicateCandidate,
  // dataSources,
  // duplicateCandidates,
  // type Favorite,
  // favorites,
  type Group,
  type GroupMember,
  groupItems,
  groups,
  // type ImageHash,
  // imageHashes,
  type Library,
  // type LibraryAccess,
  libraries,
  // libraryAccess,
  // type MatchingQueueItem,
  type MediaItem,
  // type MediaProgress,
  // matchingQueue,
  mediaItems,
  // mediaProgress,
  // type NewAiSettings,
  // type NewApiToken,
  // type NewBackupFileState,
  // type NewBackupJob,
  // type NewBackupTarget,
  // type NewBackupVerifyJob,
  // type NewDataSource,
  // type NewDuplicateCandidate,
  // type NewFavorite,
  type NewGroup,
  type NewGroupMember,
  // type NewImageHash,
  type NewLibrary,
  // type NewLibraryAccess,
  // type NewMatchingQueueItem,
  type NewMediaItem,
  // type NewMediaProgress,
  // type NewRefreshToken,
  // type NewSuggestedGroup,
  // type NewSyncProfile,
  // type NewSyncRun,
  // type NewUser,
  // type NewWatchlist,
  // type RefreshToken,
  // refreshTokens,
  // type SuggestedGroup,
  // type SyncProfile,
  // type SyncRun,
  // suggestedGroups,
  // syncProfiles,
  // syncRuns,
  // type User,
  users,
  // type Watchlist,
  // watchlist,
} from './db/schema.ts'
export { emitEvent, eventBus, type XonEvent } from './events.ts'
export {
  type AutoTag,
  type AutoTagOnnxSession,
  autoTagMediaItems,
  computeDocumentTags,
  computeImageTags,
  getAutoTagOnnxSession,
  setAutoTagOnnxSession,
} from './media/autoTag.ts'
export { detectDrm } from './media/drm.ts'
export {
  type ExiftoolMetadata,
  extractExiftoolMetadata,
  // isImageCategory,
} from './media/exiftool.ts'
export {
  extractFfprobeMetadata,
  type FfprobeMetadata,
  // isAudioVideoCategory,
} from './media/ffprobe.ts'
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
} from './media/fuzzyMatch.ts'
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
} from './media/grouping.ts'
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
} from './media/miscmeta.ts'
export {
  extractMusicTags,
  isMusicCategory,
  type MusicTagsMetadata,
} from './media/musictags.ts'
export {
  computePerceptualHash,
  getPerceptualHashOnnxSession,
  hammingDistance,
  hashSimilarity,
  type PerceptualHashConfig,
  type PerceptualHashOnnxSession,
  scanLibraryForDuplicates,
  setPerceptualHashOnnxSession,
} from './media/perceptualHash.ts'
export {} from // acceptSuggestedGroup,
// detectMultiDiscAlbums,
// detectBookSeries,
// detectSupplementaryMaterials,
// type SmartGroupCandidate,
// scanLibraryForSmartGroups,
'./media/smartGrouping.ts'
export { generateThumbnails } from './media/thumbnails.ts'
export {
  generateVideoBackdrops,
  generateVideoPosters,
  generateVideoThumbnails,
  // isVideoCategory,
} from './media/videoThumbnails.ts'
export {
  getBackupTargetPlugin,
  registerBackupTargetPlugin,
  unregisterBackupTargetPlugin,
} from './plugins/backupTargetPluginRegistry.ts'
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
// export { runMediaBackupJob } from './routes/adminBackupMedia.ts'
// export {
//   copyFilesToDestination,
//   type LocalBackupConfig,
//   type NetworkBackupConfig,
//   type PluginBackupConfig,
//   runBackupToTarget,
// } from './routes/adminBackupTargets.ts'
// export { computeChecksum, runVerifyJob } from './routes/adminBackupVerify.ts'
// export { runSyncJob } from './routes/sync.ts'
export type { LibrariesRoutes } from './routes/libraries.ts'
export type { ScanResult } from './scanner/scanner.ts'
export {
  parseCronInterval,
  type SchedulerHandle,
  startScheduler,
  type TriggerFn,
} from './scanner/scheduler.ts'
// export {
//   scanLibrary,
//   type ScanProgress,
//   type ScanSummary,
// } from './scanner/orchestrator.old.ts'
export { boot } from './server.ts'
