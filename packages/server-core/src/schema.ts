import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const libraries = sqliteTable("libraries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  allowedMediaTypes: text("allowed_media_types").notNull().default("[]"),
  scanSchedule: text("scan_schedule"),
  hideDrmItems: integer("hide_drm_items", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const dataSources = sqliteTable("data_sources", {
  id: text("id").primaryKey(),
  libraryId: text("library_id")
    .notNull()
    .references(() => libraries.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["local", "network", "plugin"] }).notNull(),
  path: text("path").notNull(),
  pluginId: text("plugin_id"),
  recursive: integer("recursive", { mode: "boolean" }).notNull().default(true),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const CONTENT_RATINGS = ["G", "PG", "PG-13", "R", "unrated", "none"] as const;
export type ContentRatingMax = (typeof CONTENT_RATINGS)[number];
export const MEDIA_CONTENT_RATINGS = ["G", "PG", "PG-13", "R", "unrated"] as const;
export type MediaContentRating = (typeof MEDIA_CONTENT_RATINGS)[number];

// Rating order index: G=0, PG=1, PG-13=2, R=3, unrated=4. "none" = no restriction.
export const RATING_ORDER: MediaContentRating[] = ["G", "PG", "PG-13", "R", "unrated"];

/**
 * Returns an array of allowed content ratings for the given maxContentRating,
 * or null if there is no restriction (maxContentRating === "none").
 */
export function getAllowedRatings(maxContentRating: ContentRatingMax): MediaContentRating[] | null {
  if (maxContentRating === "none") return null;
  const idx = RATING_ORDER.indexOf(maxContentRating as MediaContentRating);
  if (idx === -1) return null;
  return RATING_ORDER.slice(0, idx + 1);
}

export const mediaItems = sqliteTable(
  "media_items",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type"),
    mediaCategory: text("media_category"),
    contentRating: text("content_rating", { enum: ["G", "PG", "PG-13", "R", "unrated"] }),
    title: text("title"),
    description: text("description"),
    metadata: text("metadata").notNull().default("{}"),
    thumbnailPaths: text("thumbnail_paths"),
    drmProtected: integer("drm_protected", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    scannedAt: integer("scanned_at", { mode: "timestamp" }),
  },
  (table) => [
    index("media_items_library_id_idx").on(table.libraryId),
    index("media_items_media_category_idx").on(table.mediaCategory),
    index("media_items_file_path_idx").on(table.filePath),
  ]
);

export const readingPositions = sqliteTable("reading_positions", {
  id: text("id").primaryKey(),
  mediaItemId: text("media_item_id")
    .notNull()
    .unique()
    .references(() => mediaItems.id, { onDelete: "cascade" }),
  cfi: text("cfi").notNull(),
  chapterTitle: text("chapter_title"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "manager", "user", "guest"] })
    .notNull()
    .default("user"),
  maxContentRating: text("max_content_rating", {
    enum: ["G", "PG", "PG-13", "R", "unrated", "none"],
  })
    .notNull()
    .default("none"),
  hideDrmItems: integer("hide_drm_items", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type Library = typeof libraries.$inferSelect;
export type NewLibrary = typeof libraries.$inferInsert;
export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
export type ReadingPosition = typeof readingPositions.$inferSelect;
export type NewReadingPosition = typeof readingPositions.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

export const libraryAccess = sqliteTable(
  "library_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    grantedAt: integer("granted_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.libraryId] })]
);

export type LibraryAccess = typeof libraryAccess.$inferSelect;
export type NewLibraryAccess = typeof libraryAccess.$inferInsert;

export const mediaProgress = sqliteTable(
  "media_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    duration: integer("duration").notNull().default(0),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.mediaItemId] })]
);

export type MediaProgress = typeof mediaProgress.$inferSelect;
export type NewMediaProgress = typeof mediaProgress.$inferInsert;

export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.mediaItemId] })]
);

export const watchlist = sqliteTable(
  "watchlist",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.mediaItemId] })]
);

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type Watchlist = typeof watchlist.$inferSelect;
export type NewWatchlist = typeof watchlist.$inferInsert;

export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export const GROUP_TYPES = [
  "series",
  "season",
  "album",
  "artist",
  "book-series",
  "collection",
  "playlist",
  "shelf",
  "folder",
] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    parentGroupId: text("parent_group_id"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index("groups_library_id_idx").on(table.libraryId),
    index("groups_parent_group_id_idx").on(table.parentGroupId),
  ]
);

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.mediaItemId] })]
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;

export const matchingQueue = sqliteTable(
  "matching_queue",
  {
    id: text("id").primaryKey(),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    suggestedTitle: text("suggested_title").notNull(),
    suggestedMetadata: text("suggested_metadata").notNull().default("{}"),
    confidence: integer("confidence").notNull(),
    status: text("status", { enum: ["pending", "confirmed", "rejected"] })
      .notNull()
      .default("pending"),
    matchSource: text("match_source", { enum: ["local", "cloud"] })
      .notNull()
      .default("local"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index("matching_queue_media_item_id_idx").on(table.mediaItemId),
    index("matching_queue_status_idx").on(table.status),
  ]
);

export type MatchingQueueItem = typeof matchingQueue.$inferSelect;
export type NewMatchingQueueItem = typeof matchingQueue.$inferInsert;

export const imageHashes = sqliteTable(
  "image_hashes",
  {
    id: text("id").primaryKey(),
    mediaItemId: text("media_item_id")
      .notNull()
      .unique()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index("image_hashes_media_item_id_idx").on(table.mediaItemId)]
);

export type ImageHash = typeof imageHashes.$inferSelect;
export type NewImageHash = typeof imageHashes.$inferInsert;

export const duplicateCandidates = sqliteTable(
  "duplicate_candidates",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    mediaItemId1: text("media_item_id_1")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    mediaItemId2: text("media_item_id_2")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    /** Similarity score 0–100 (higher = more similar) */
    similarity: integer("similarity").notNull(),
    status: text("status", { enum: ["pending", "kept_both", "kept_first", "kept_second"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index("duplicate_candidates_library_id_idx").on(table.libraryId),
    index("duplicate_candidates_status_idx").on(table.status),
  ]
);

export type DuplicateCandidate = typeof duplicateCandidates.$inferSelect;
export type NewDuplicateCandidate = typeof duplicateCandidates.$inferInsert;

export const suggestedGroups = sqliteTable(
  "suggested_groups",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    suggestedTitle: text("suggested_title").notNull(),
    /** e.g. "album", "book-series", "collection" */
    suggestedType: text("suggested_type").notNull(),
    /** Human-readable explanation of why these files were grouped */
    reason: text("reason").notNull(),
    /** JSON array of mediaItem IDs */
    memberItemIds: text("member_item_ids").notNull().default("[]"),
    /** Confidence score 0–100 */
    confidence: integer("confidence").notNull(),
    status: text("status", { enum: ["pending", "accepted", "rejected"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index("suggested_groups_library_id_idx").on(table.libraryId),
    index("suggested_groups_status_idx").on(table.status),
  ]
);

export type SuggestedGroup = typeof suggestedGroups.$inferSelect;
export type NewSuggestedGroup = typeof suggestedGroups.$inferInsert;

export const AI_MODES = ["local-only", "cloud-only", "local-with-cloud-fallback"] as const;
export type AiMode = (typeof AI_MODES)[number];

export const aiSettings = sqliteTable("ai_settings", {
  id: text("id").primaryKey(),
  aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull().default(true),
  aiMode: text("ai_mode", { enum: ["local-only", "cloud-only", "local-with-cloud-fallback"] })
    .notNull()
    .default("local-only"),
  /** Encrypted cloud API key (iv:tag:ciphertext hex) */
  cloudApiKey: text("cloud_api_key"),
  cloudApiUrl: text("cloud_api_url"),
  featureMatching: integer("feature_matching", { mode: "boolean" }).notNull().default(true),
  featureTagging: integer("feature_tagging", { mode: "boolean" }).notNull().default(true),
  featureSimilarity: integer("feature_similarity", { mode: "boolean" }).notNull().default(true),
  featureSmartGrouping: integer("feature_smart_grouping", { mode: "boolean" })
    .notNull()
    .default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AiSettingsRow = typeof aiSettings.$inferSelect;
export type NewAiSettings = typeof aiSettings.$inferInsert;

export const backupTargets = sqliteTable("backup_targets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** "local" | "network" | "plugin" */
  type: text("type", { enum: ["local", "network", "plugin"] })
    .notNull()
    .default("local"),
  /** JSON config — local: { destPath: string }; network: { mountPath: string }; plugin: { pluginId: string, ...pluginConfig } */
  config: text("config").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** When true, files deleted from the source are also removed from the backup destination */
  removeDeleted: integer("remove_deleted", { mode: "boolean" }).notNull().default(false),
  /** Cron expression for automatic scheduled backups (e.g. "0 2 * * *") */
  schedule: text("schedule"),
  /** Keep N most recent backup jobs; older jobs are pruned */
  retentionKeepCount: integer("retention_keep_count"),
  /** Keep backup jobs created within the last N days; older jobs are pruned */
  retentionKeepDays: integer("retention_keep_days"),
  /** Timestamp of next scheduled backup run */
  nextScheduledAt: integer("next_scheduled_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type BackupTarget = typeof backupTargets.$inferSelect;
export type NewBackupTarget = typeof backupTargets.$inferInsert;

export const backupJobs = sqliteTable("backup_jobs", {
  id: text("id").primaryKey(),
  targetId: text("target_id")
    .notNull()
    .references(() => backupTargets.id, { onDelete: "cascade" }),
  /** JSON scope: { all?, libraryIds?, mediaTypes?, itemIds? } */
  scope: text("scope").notNull().default("{}"),
  /** pending | running | completed | failed */
  status: text("status", { enum: ["pending", "running", "completed", "failed"] })
    .notNull()
    .default("pending"),
  totalFiles: integer("total_files").notNull().default(0),
  copiedFiles: integer("copied_files").notNull().default(0),
  skippedFiles: integer("skipped_files").notNull().default(0),
  /** JSON array of error strings */
  errors: text("errors").notNull().default("[]"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type BackupJob = typeof backupJobs.$inferSelect;
export type NewBackupJob = typeof backupJobs.$inferInsert;

export const backupFileState = sqliteTable(
  "backup_file_state",
  {
    id: text("id").primaryKey(),
    targetId: text("target_id")
      .notNull()
      .references(() => backupTargets.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    /** Source file size in bytes at time of last backup */
    fileSize: integer("file_size").notNull().default(0),
    /** Source file mtime as Unix timestamp (ms) at time of last backup */
    mtime: integer("mtime").notNull().default(0),
    /** Optional checksum (e.g. SHA-256 hex) for integrity verification */
    checksum: text("checksum"),
    backedUpAt: integer("backed_up_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("backup_file_state_target_path_idx").on(t.targetId, t.filePath)]
);

export type BackupFileState = typeof backupFileState.$inferSelect;
export type NewBackupFileState = typeof backupFileState.$inferInsert;

export const backupVerifyJobs = sqliteTable("backup_verify_jobs", {
  id: text("id").primaryKey(),
  targetId: text("target_id")
    .notNull()
    .references(() => backupTargets.id, { onDelete: "cascade" }),
  /** pending | running | completed | failed */
  status: text("status", { enum: ["pending", "running", "completed", "failed"] })
    .notNull()
    .default("pending"),
  totalFiles: integer("total_files").notNull().default(0),
  passedFiles: integer("passed_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  missingFiles: integer("missing_files").notNull().default(0),
  /** JSON array of { filePath: string, reason: string } */
  failedItems: text("failed_items").notNull().default("[]"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type BackupVerifyJob = typeof backupVerifyJobs.$inferSelect;
export type NewBackupVerifyJob = typeof backupVerifyJobs.$inferInsert;

export const syncProfiles = sqliteTable("sync_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** full | partial */
  type: text("type", { enum: ["full", "partial"] })
    .notNull()
    .default("full"),
  /** JSON: { libraryIds?, groupIds?, itemIds?, mediaTypes? } */
  scope: text("scope").notNull().default("{}"),
  targetPath: text("target_path").notNull(),
  includeMedia: integer("include_media", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type SyncProfile = typeof syncProfiles.$inferSelect;
export type NewSyncProfile = typeof syncProfiles.$inferInsert;

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => syncProfiles.id, { onDelete: "cascade" }),
  /** pending | running | completed | failed */
  status: text("status", { enum: ["pending", "running", "completed", "failed"] })
    .notNull()
    .default("pending"),
  totalItems: integer("total_items").notNull().default(0),
  syncedItems: integer("synced_items").notNull().default(0),
  /** JSON array of error strings */
  errors: text("errors").notNull().default("[]"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;

export const serverSettings = sqliteTable("server_settings", {
  id: text("id").primaryKey(),
  corsEnabled: integer("cors_enabled", { mode: "boolean" }).notNull().default(false),
  /** JSON array of allowed origins, e.g. ["https://example.com"] or ["*"] */
  corsAllowedOrigins: text("cors_allowed_origins").notNull().default('["*"]'),
  rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }).notNull().default(true),
  /** Max general API requests per minute per IP */
  rateLimitGeneral: integer("rate_limit_general").notNull().default(100),
  /** Max auth endpoint requests per minute per IP */
  rateLimitAuth: integer("rate_limit_auth").notNull().default(10),
  /** Enable built-in HTTPS */
  httpsEnabled: integer("https_enabled", { mode: "boolean" }).notNull().default(false),
  /** Path to TLS certificate file (PEM) for manual HTTPS */
  httpsCertPath: text("https_cert_path"),
  /** Path to TLS private key file (PEM) for manual HTTPS */
  httpsKeyPath: text("https_key_path"),
  /** Enable automatic HTTPS via Let's Encrypt ACME */
  acmeEnabled: integer("acme_enabled", { mode: "boolean" }).notNull().default(false),
  /** Domain name for ACME certificate */
  acmeDomain: text("acme_domain"),
  /** Email address for ACME account registration */
  acmeEmail: text("acme_email"),
  /** Directory to store ACME certificates */
  acmeCertsDir: text("acme_certs_dir"),
  /** Trust X-Forwarded-For and X-Forwarded-Proto headers from reverse proxies */
  trustProxy: integer("trust_proxy", { mode: "boolean" }).notNull().default(false),
  /** Server port (requires restart) */
  serverPort: integer("server_port").notNull().default(32400),
  /** Data directory path (requires restart) */
  dataDirectory: text("data_directory").notNull().default("./data"),
  /** Default cron expression for library scan schedule, e.g. "0 2 * * *" */
  defaultScanSchedule: text("default_scan_schedule"),
  /** JSON array of enabled thumbnail sizes, e.g. ["small","medium"] */
  thumbnailSizes: text("thumbnail_sizes").notNull().default('["small","medium"]'),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type ServerSettings = typeof serverSettings.$inferSelect;
export type NewServerSettings = typeof serverSettings.$inferInsert;
