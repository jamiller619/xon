import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { libraries } from './libraries.js'
import { mediaItems } from './media.js'

export const imageHashes = sqliteTable(
  'image_hashes',
  {
    id: text('id').primaryKey(),
    mediaItemId: text('media_item_id')
      .notNull()
      .unique()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index('image_hashes_media_item_id_idx').on(table.mediaItemId)],
)

export const duplicateCandidates = sqliteTable(
  'duplicate_candidates',
  {
    id: text('id').primaryKey(),
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    mediaItemId1: text('media_item_id_1')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    mediaItemId2: text('media_item_id_2')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    similarity: integer('similarity').notNull(),
    status: text('status', {
      enum: ['pending', 'kept_both', 'kept_first', 'kept_second'],
    })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('duplicate_candidates_library_id_idx').on(table.libraryId),
    index('duplicate_candidates_status_idx').on(table.status),
  ],
)

export const matchingQueue = sqliteTable(
  'matching_queue',
  {
    id: text('id').primaryKey(),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    suggestedTitle: text('suggested_title').notNull(),
    suggestedMetadata: text('suggested_metadata').notNull().default('{}'),
    confidence: integer('confidence').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'rejected'] })
      .notNull()
      .default('pending'),
    matchSource: text('match_source', { enum: ['cloud'] })
      .notNull()
      .default('cloud'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('matching_queue_media_item_id_idx').on(table.mediaItemId),
    index('matching_queue_status_idx').on(table.status),
  ],
)

export const suggestedGroups = sqliteTable(
  'suggested_groups',
  {
    id: text('id').primaryKey(),
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    suggestedTitle: text('suggested_title').notNull(),
    suggestedType: text('suggested_type').notNull(),
    reason: text('reason').notNull(),
    memberItemIds: text('member_item_ids').notNull().default('[]'),
    confidence: integer('confidence').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('suggested_groups_library_id_idx').on(table.libraryId),
    index('suggested_groups_status_idx').on(table.status),
  ],
)

export const AI_MODES = [
  'local-only',
  'cloud-only',
  'local-with-cloud-fallback',
] as const
export type AiMode = (typeof AI_MODES)[number]

export const aiSettings = sqliteTable('ai_settings', {
  id: text('id').primaryKey(),
  aiEnabled: integer('ai_enabled', { mode: 'boolean' }).notNull().default(true),
  aiMode: text('ai_mode', {
    enum: ['local-only', 'cloud-only', 'local-with-cloud-fallback'],
  })
    .notNull()
    .default('local-only'),
  cloudApiKey: text('cloud_api_key'),
  cloudApiUrl: text('cloud_api_url'),
  featureMatching: integer('feature_matching', { mode: 'boolean' })
    .notNull()
    .default(true),
  featureTagging: integer('feature_tagging', { mode: 'boolean' })
    .notNull()
    .default(true),
  featureSimilarity: integer('feature_similarity', { mode: 'boolean' })
    .notNull()
    .default(true),
  featureSmartGrouping: integer('feature_smart_grouping', { mode: 'boolean' })
    .notNull()
    .default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type ImageHash = typeof imageHashes.$inferSelect
export type NewImageHash = typeof imageHashes.$inferInsert
export type DuplicateCandidate = typeof duplicateCandidates.$inferSelect
export type NewDuplicateCandidate = typeof duplicateCandidates.$inferInsert
export type MatchingQueueItem = typeof matchingQueue.$inferSelect
export type NewMatchingQueueItem = typeof matchingQueue.$inferInsert
export type SuggestedGroup = typeof suggestedGroups.$inferSelect
export type NewSuggestedGroup = typeof suggestedGroups.$inferInsert
export type AiSettingsRow = typeof aiSettings.$inferSelect
export type NewAiSettings = typeof aiSettings.$inferInsert
