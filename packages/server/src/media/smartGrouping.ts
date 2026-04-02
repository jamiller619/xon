import { randomUUID } from 'node:crypto'
import { basename, dirname } from 'node:path'
import { MediaCategory } from '@xon/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  groupMembers,
  groups,
  libraries,
  mediaItems,
  suggestedGroups,
} from '../db/schema.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartGroupCandidate {
  title: string
  type: 'album' | 'book-series' | 'collection'
  reason: string
  itemIds: string[]
  confidence: number
}

// ─── Multi-disc album detection ───────────────────────────────────────────────

const DISC_PATTERN = /\b(?:disc|disk|cd|vol(?:ume)?|part|pt)\s*(\d+)\b/i

/**
 * Extracts album title from music item metadata, falling back to parent folder.
 * When the parent directory is itself a disc folder (e.g. "Disc 1", "CD2"),
 * uses the grandparent directory instead.
 */
function getAlbumTitle(item: typeof mediaItems.$inferSelect): string | null {
  const meta = (() => {
    try {
      return JSON.parse(item.metadata) as Record<string, unknown>
    } catch {
      return null
    }
  })()
  if (typeof meta?.album === 'string' && meta.album.length > 0) {
    return meta.album
  }
  // Fallback: use parent directory name, or grandparent if parent is a disc folder
  const parentDir = basename(dirname(item.filePath))
  if (DISC_PATTERN.test(parentDir)) {
    // Parent is itself a disc folder → use grandparent as album name
    const grandParentDir = basename(dirname(dirname(item.filePath)))
    return grandParentDir.length > 0 ? grandParentDir : null
  }
  // Strip trailing disc indicator from folder name
  const cleaned = parentDir
    .replace(DISC_PATTERN, '')
    .trim()
    .replace(/[-_\s]+$/, '')
  return cleaned.length > 0 ? cleaned : null
}

/**
 * Detects multi-disc albums among music items.
 *
 * Groups music tracks by normalised album title. When tracks in the same album
 * reside in different directories AND those directories contain a disc/CD/volume
 * indicator, they are flagged as a multi-disc album candidate.
 */
export function detectMultiDiscAlbums(
  items: Array<typeof mediaItems.$inferSelect>,
): SmartGroupCandidate[] {
  const MUSIC_CATEGORIES: string[] = [
    MediaCategory.Music,
    MediaCategory.Audiobooks,
    MediaCategory.AudioClips,
  ]

  const musicItems = items.filter(
    (i) =>
      i.mediaCategory !== null && MUSIC_CATEGORIES.includes(i.mediaCategory),
  )

  // Group by album title → collect parent directories
  const albumDirs = new Map<string, { dirs: Set<string>; ids: string[] }>()

  for (const item of musicItems) {
    const album = getAlbumTitle(item)
    if (!album) continue

    const parentDir = dirname(item.filePath)
    const existing = albumDirs.get(album)
    if (existing) {
      existing.dirs.add(parentDir)
      existing.ids.push(item.id)
    } else {
      albumDirs.set(album, { dirs: new Set([parentDir]), ids: [item.id] })
    }
  }

  const candidates: SmartGroupCandidate[] = []

  for (const [albumTitle, { dirs, ids }] of albumDirs) {
    if (dirs.size < 2) continue // All tracks in same folder → not multi-disc

    // Check if any directory contains a disc indicator
    const hasDiscIndicator = [...dirs].some((d) =>
      DISC_PATTERN.test(basename(d)),
    )
    if (!hasDiscIndicator) continue

    candidates.push({
      title: albumTitle,
      type: 'album',
      reason: `Multi-disc album "${albumTitle}" found across ${dirs.size} directories`,
      itemIds: ids,
      confidence: 85,
    })
  }

  return candidates
}

// ─── Book series detection ─────────────────────────────────────────────────────

const SERIES_INDICATORS = [
  /\b(?:vol(?:ume)?|book|part|pt|#|no\.?)\s*(\d+)\b/i,
  /\s(\d+)\s*(?:of\s*\d+)?$/i, // trailing number "Book 1 of 5" or "Title 3"
  /[-_\s](\d{1,2})(?:\s*[-_(]|$)/i, // "Title - 2" or "Title_02"
]

/**
 * Normalises a title for comparison: lowercase, remove numbers and punctuation.
 */
function normaliseTitleForSeries(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(?:vol(?:ume)?|book|part|pt|#|no\.?)\s*\d+\b/gi, '')
    .replace(/\s\d+(\s*(?:of\s*\d+))?$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detects book series or audiobook series from loosely named files.
 * Looks for multiple documents/audiobooks sharing the same normalised title base
 * and containing series indicator patterns.
 */
export function detectBookSeries(
  items: Array<typeof mediaItems.$inferSelect>,
): SmartGroupCandidate[] {
  const BOOK_CATEGORIES: string[] = [
    MediaCategory.Documents,
    MediaCategory.Audiobooks,
  ]

  const bookItems = items.filter(
    (i) =>
      i.mediaCategory !== null && BOOK_CATEGORIES.includes(i.mediaCategory),
  )

  // Group by normalised title base
  const titleGroups = new Map<string, { ids: string[]; titles: string[] }>()

  for (const item of bookItems) {
    const rawTitle = item.title ?? item.fileName
    // Only consider items that have a series indicator
    const hasIndicator = SERIES_INDICATORS.some((re) => re.test(rawTitle))
    if (!hasIndicator) continue

    const normalised = normaliseTitleForSeries(rawTitle)
    if (normalised.length < 3) continue

    const existing = titleGroups.get(normalised)
    if (existing) {
      existing.ids.push(item.id)
      existing.titles.push(rawTitle)
    } else {
      titleGroups.set(normalised, { ids: [item.id], titles: [rawTitle] })
    }
  }

  const candidates: SmartGroupCandidate[] = []

  for (const [normalised, { ids, titles }] of titleGroups) {
    if (ids.length < 2) continue

    const seriesTitle = (() => {
      // Use the longest common prefix of actual titles as the series name
      let prefix = titles[0] ?? normalised
      for (const t of titles.slice(1)) {
        let i = 0
        while (i < prefix.length && i < t.length && prefix[i] === t[i]) i++
        prefix = prefix
          .slice(0, i)
          .replace(/[-_\s,]+$/, '')
          .trim()
      }
      return prefix.length > 2 ? prefix : normalised
    })()

    candidates.push({
      title: seriesTitle,
      type: 'book-series',
      reason: `Book series "${seriesTitle}" detected across ${ids.length} items`,
      itemIds: ids,
      confidence: 75,
    })
  }

  return candidates
}

// ─── Supplementary materials detection ───────────────────────────────────────

/**
 * Strips extension and common quality/format suffixes, then normalises separators.
 */
function baseNameKey(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt
    .toLowerCase()
    .replace(/[-_.\s]+/g, ' ')
    .replace(
      /\b(?:guide|manual|readme|notes?|supplement|extras?|bonus|companion|workbook|transcript|slides?|resources?|materials?|handout|worksheet|cheatsheet|reference)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detects supplementary materials that belong to the same course or project.
 *
 * Looks for items from different media categories (e.g., video + document) that
 * share the same normalised base name, suggesting they are companion files for
 * the same content unit.
 */
export function detectSupplementaryMaterials(
  items: Array<typeof mediaItems.$inferSelect>,
): SmartGroupCandidate[] {
  const SUPPLEMENTARY_CATEGORIES: string[] = [
    MediaCategory.Documents,
    MediaCategory.Music,
    MediaCategory.Movies,
    MediaCategory.Clips,
    MediaCategory.HomeVideos,
    MediaCategory.WebMedia,
  ]

  const eligible = items.filter(
    (i) =>
      i.mediaCategory !== null &&
      SUPPLEMENTARY_CATEGORIES.includes(i.mediaCategory),
  )

  // Group by normalised base name key
  const baseGroups = new Map<
    string,
    { ids: string[]; categories: Set<string>; dirs: Set<string> }
  >()

  for (const item of eligible) {
    const key = baseNameKey(item.fileName)
    if (key.length < 3) continue

    const existing = baseGroups.get(key)
    if (existing) {
      existing.ids.push(item.id)
      if (item.mediaCategory) existing.categories.add(item.mediaCategory)
      existing.dirs.add(dirname(item.filePath))
    } else {
      baseGroups.set(key, {
        ids: [item.id],
        categories: new Set(item.mediaCategory ? [item.mediaCategory] : []),
        dirs: new Set([dirname(item.filePath)]),
      })
    }
  }

  const candidates: SmartGroupCandidate[] = []

  for (const [key, { ids, categories, dirs }] of baseGroups) {
    // Require: multiple categories OR files in different directories
    if (ids.length < 2) continue
    if (categories.size < 2 && dirs.size < 2) continue

    candidates.push({
      title: key,
      type: 'collection',
      reason: `Supplementary materials for "${key}" found across ${categories.size} media type(s)`,
      itemIds: ids,
      confidence: 65,
    })
  }

  return candidates
}

// ─── Deduplication of candidates ─────────────────────────────────────────────

/**
 * Merges overlapping candidates: if two candidates share ≥50% of their item IDs,
 * keep the higher-confidence one.
 */
function deduplicateCandidates(
  candidates: SmartGroupCandidate[],
): SmartGroupCandidate[] {
  const result: SmartGroupCandidate[] = []
  const used = new Set<number>()

  // Sort by confidence descending so higher-confidence wins
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence)

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue
    const a = sorted[i]
    if (!a) continue
    const setA = new Set(a.itemIds)

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue
      const b = sorted[j]
      if (!b) continue
      const intersection = b.itemIds.filter((id) => setA.has(id)).length
      const smaller = Math.min(a.itemIds.length, b.itemIds.length)
      if (intersection / smaller >= 0.5) {
        used.add(j)
      }
    }

    result.push(a)
  }

  return result
}

// ─── Main scan function ────────────────────────────────────────────────────────

/**
 * Scans a library for scattered files that may belong to the same logical unit.
 * Inserts new `suggested_groups` records (skips already-existing ones for the same
 * title+type combination).
 *
 * Returns the number of new suggestions inserted.
 */
export async function scanLibraryForSmartGroups(
  db: LibSQLDatabase,
  libraryId: string,
): Promise<number> {
  // Verify library exists
  const libRows = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, libraryId))
  if (libRows.length === 0) return 0

  // Load all media items for this library
  const items = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.libraryId, libraryId))

  if (items.length === 0) return 0

  // Run all detectors
  const raw: SmartGroupCandidate[] = [
    ...detectMultiDiscAlbums(items),
    ...detectBookSeries(items),
    ...detectSupplementaryMaterials(items),
  ]

  const candidates = deduplicateCandidates(raw)

  if (candidates.length === 0) return 0

  // Load existing pending/accepted suggestions for this library to avoid duplicates
  const existing = await db
    .select({
      title: suggestedGroups.suggestedTitle,
      type: suggestedGroups.suggestedType,
    })
    .from(suggestedGroups)
    .where(
      and(
        eq(suggestedGroups.libraryId, libraryId),
        inArray(suggestedGroups.status, ['pending', 'accepted']),
      ),
    )

  const existingKeys = new Set(
    existing.map((e) => `${e.type}::${e.title.toLowerCase()}`),
  )

  const toInsert = candidates.filter(
    (c) => !existingKeys.has(`${c.type}::${c.title.toLowerCase()}`),
  )

  if (toInsert.length === 0) return 0

  const now = new Date()
  await db.insert(suggestedGroups).values(
    toInsert.map((c) => ({
      id: randomUUID(),
      libraryId,
      suggestedTitle: c.title,
      suggestedType: c.type,
      reason: c.reason,
      memberItemIds: JSON.stringify(c.itemIds),
      confidence: c.confidence,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    })),
  )

  return toInsert.length
}

/**
 * Accepts a suggested group: creates a real group + group members, then marks
 * the suggestion as accepted.
 */
export async function acceptSuggestedGroup(
  db: LibSQLDatabase,
  suggestionId: string,
): Promise<{ groupId: string } | null> {
  const rows = await db
    .select()
    .from(suggestedGroups)
    .where(eq(suggestedGroups.id, suggestionId))

  if (rows.length === 0) return null
  const suggestion = rows[0]
  if (!suggestion) return null
  if (suggestion.status !== 'pending') return null

  const itemIds: string[] = (() => {
    try {
      return JSON.parse(suggestion.memberItemIds) as string[]
    } catch {
      return []
    }
  })()

  const groupId = `grp:smart:${suggestion.libraryId}:${suggestion.suggestedTitle}`
  const now = new Date()

  // Upsert the group
  await db
    .insert(groups)
    .values({
      id: groupId,
      libraryId: suggestion.libraryId,
      type: suggestion.suggestedType,
      title: suggestion.suggestedTitle,
      metadata: JSON.stringify({
        source: 'smart-grouping',
        reason: suggestion.reason,
      }),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: groups.id,
      set: { title: suggestion.suggestedTitle },
    })

  // Insert group members (skip duplicates)
  if (itemIds.length > 0) {
    for (const mediaItemId of itemIds) {
      await db
        .insert(groupMembers)
        .values({ groupId, mediaItemId, sortOrder: 0 })
        .onConflictDoNothing()
    }
  }

  // Mark suggestion as accepted
  await db
    .update(suggestedGroups)
    .set({ status: 'accepted', updatedAt: now })
    .where(eq(suggestedGroups.id, suggestionId))

  return { groupId }
}
