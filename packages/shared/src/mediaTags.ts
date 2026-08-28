import type { Metadata } from './types.js'

export const GENRE_TAG_PREFIX = 'genre:'

const NON_WORD_RUN = /[^\p{L}\p{N}]+/gu

export type MediaTagSources = {
  metadata?: Metadata | undefined
  fileMetadata?: Metadata | undefined
  existingTags?: readonly unknown[] | undefined
}

/** Convert a genre display value to the stable value stored after `genre:`. */
export function normalizeGenre(value: string): string | undefined {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(NON_WORD_RUN, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || undefined
}

export function genreTag(value: string): string | undefined {
  const normalized = normalizeGenre(value)
  return normalized ? `${GENRE_TAG_PREFIX}${normalized}` : undefined
}

/** The complete `genre:` namespace is reserved, including malformed values. */
export function isGenreTag(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.trim().toLowerCase().startsWith(GENRE_TAG_PREFIX)
  )
}

export function genreNameFromTag(value: unknown): string | undefined {
  if (typeof value !== 'string' || !isGenreTag(value)) return

  const normalized = normalizeGenre(value.trim().slice(GENRE_TAG_PREFIX.length))
  if (!normalized) return

  return normalized
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

export function genreNamesFromTags(tags: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []

  for (const tag of tags) {
    const name = genreNameFromTag(tag)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }

  return names
}

/** Normalize user-controlled tags without allowing system-owned genre tags. */
export function normalizeManualTags(tags: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const tag of tags) {
    if (typeof tag !== 'string' || isGenreTag(tag)) continue
    const value = tag.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(value)
  }

  return normalized
}

/** Replace user tags while retaining the current system-owned genre tags. */
export function replaceManualTags(
  existingTags: readonly unknown[],
  manualTags: readonly unknown[],
): string[] {
  return [
    ...normalizeManualTags(manualTags),
    ...existingTags.filter(
      (tag): tag is string => typeof tag === 'string' && isGenreTag(tag),
    ),
  ]
}

/**
 * Replace only the generated genre namespace. Enriched metadata is considered
 * before embedded metadata, and plural fields before legacy singular fields.
 */
export function deriveMediaTags({
  metadata = {},
  fileMetadata = {},
  existingTags = [],
}: MediaTagSources): string[] {
  const manualTags = existingTags.filter(
    (tag): tag is string => typeof tag === 'string' && !isGenreTag(tag),
  )
  const generatedTags: string[] = []
  const seen = new Set<string>()

  for (const source of [
    metadata.genres,
    metadata.genre,
    fileMetadata.genres,
    fileMetadata.genre,
  ]) {
    for (const value of stringValues(source)) {
      const tag = genreTag(value)
      if (!tag || seen.has(tag)) continue
      seen.add(tag)
      generatedTags.push(tag)
    }
  }

  return [...manualTags, ...generatedTags]
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}
