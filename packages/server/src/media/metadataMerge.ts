import type { Metadata } from '@xon/shared'
import deepmerge from 'deepmerge'

/**
 * Deeply merge provider metadata while preserving values from every array.
 * Existing values remain first so manifest-priority providers retain display
 * precedence. Equivalent values are deduplicated to keep refreshes idempotent.
 */
export function mergeMetadata(
  existing: Metadata,
  incoming: Metadata,
  options: { incomingArraysFirst?: boolean } = {},
): Metadata {
  return deepmerge(existing, incoming, {
    arrayMerge: options.incomingArraysFirst
      ? (target, source) => mergeUniqueArrays(source, target)
      : mergeUniqueArrays,
  })
}

function mergeUniqueArrays(target: unknown[], source: unknown[]): unknown[] {
  const merged: unknown[] = []
  const seen = new Set<string>()

  for (const value of [...target, ...source]) {
    const key = metadataValueKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(value)
  }

  return merged
}

function metadataValueKey(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return `${typeof value}:${String(value)}`
  }

  if ('src' in value && typeof value.src === 'string') {
    return `src:${value.src}`
  }

  return `object:${stableStringify(value)}`
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
