export { app } from "./app.js";
export { emitEvent, eventBus, type XonEvent } from "./events.js";
export { openDatabase, type LibSQLDatabase } from "./db.js";
export { migrateDatabase } from "./migrate.js";
export {
  libraries,
  dataSources,
  mediaItems,
  type Library,
  type NewLibrary,
  type DataSource,
  type NewDataSource,
  type MediaItem,
  type NewMediaItem,
} from "./schema.js";
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
