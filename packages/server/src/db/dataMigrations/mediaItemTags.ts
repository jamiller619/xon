import {
  deriveMediaTags,
  isGenreTag,
  type Metadata,
  normalizeManualTags,
} from '@xon/shared'
import { eq, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { mediaItems } from '../schema.ts'

const MIGRATION_ID = '0006_media_item_genre_tags'

export type MediaItemTagMigrationValue = {
  tags: string[]
  metadata: Metadata
  changed: boolean
}

export function migrateMediaItemTagValue(
  tagsValue: unknown,
  metadataValue: unknown,
  fileMetadataValue: unknown,
): MediaItemTagMigrationValue | null {
  const tags = parseStringArray(tagsValue)
  const metadata = parseRecord(metadataValue)
  const fileMetadata = parseRecord(fileMetadataValue)
  if (!tags || !metadata || !fileMetadata) return null

  const nextMetadata = { ...metadata }
  const legacyTags = Array.isArray(metadata.tags)
    ? normalizeManualTags(metadata.tags)
    : []
  if (Array.isArray(metadata.tags)) delete nextMetadata.tags

  const existingManualTags = tags.filter((tag) => !isGenreTag(tag))
  const manualKeys = new Set(
    existingManualTags.map((tag) => tag.trim().toLowerCase()),
  )
  for (const tag of legacyTags) {
    const key = tag.toLowerCase()
    if (manualKeys.has(key)) continue
    manualKeys.add(key)
    existingManualTags.push(tag)
  }

  const nextTags = deriveMediaTags({
    metadata: nextMetadata,
    fileMetadata,
    existingTags: existingManualTags,
  })

  return {
    tags: nextTags,
    metadata: nextMetadata,
    changed:
      JSON.stringify(nextTags) !== JSON.stringify(tags) ||
      JSON.stringify(nextMetadata) !== JSON.stringify(metadata),
  }
}

export async function migrateMediaItemTags(db: LibSQLDatabase): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS xon_data_migrations (
      id text PRIMARY KEY NOT NULL,
      applied_at integer NOT NULL
    )
  `)
  const applied = await db.all<{ id: string }>(sql`
    SELECT id FROM xon_data_migrations WHERE id = ${MIGRATION_ID}
  `)
  if (applied.length > 0) return

  const rows = await db
    .select({
      id: mediaItems.id,
      tags: sql<unknown>`${mediaItems.tags}`,
      metadata: sql<unknown>`${mediaItems.metadata}`,
      fileMetadata: sql<unknown>`${mediaItems.fileMetadata}`,
    })
    .from(mediaItems)

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const migrated = migrateMediaItemTagValue(
        row.tags,
        row.metadata,
        row.fileMetadata,
      )
      if (!migrated?.changed) continue

      await tx
        .update(mediaItems)
        .set({ tags: migrated.tags, metadata: migrated.metadata })
        .where(eq(mediaItems.id, row.id))
    }

    await tx.run(sql`
      INSERT INTO xon_data_migrations (id, applied_at)
      VALUES (${MIGRATION_ID}, ${Date.now()})
    `)
  })
}

function parseStringArray(value: unknown): string[] | null {
  const parsed = parseJson(value)
  if (
    !Array.isArray(parsed) ||
    parsed.some((entry) => typeof entry !== 'string')
  ) {
    return null
  }
  return parsed
}

function parseRecord(value: unknown): Metadata | null {
  const parsed = parseJson(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null
  return parsed as Metadata
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
