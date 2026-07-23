import type {
  MetadataSearchQuery,
  MetadataSearchResult,
  MetadataSourcePlugin,
} from '@xon/plugin-sdk'
import type { MediaType, Metadata } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { libraries, mediaItems } from '../db/schema.ts'
import { mergeMetadata } from '../media/metadataMerge.ts'
import {
  getPluginsByCategory,
  type PluginEntry,
} from '../plugins/pluginManager.ts'

export type MatchProviderStatus = 'success' | 'error' | 'unavailable'

export interface MatchProviderDescriptor {
  id: string
  name: string
  priority: number
  available: boolean
  reason?: string | undefined
}

export interface MatchProviderResults extends MatchProviderDescriptor {
  status: MatchProviderStatus
  results: MetadataSearchResult[]
  error?: string | undefined
}

type MatchContext = {
  item: typeof mediaItems.$inferSelect
  libraryType: typeof libraries.$inferSelect.type
  mediaType: MediaType.MainType
}

export async function getMatchContext(
  db: LibSQLDatabase,
  mediaId: string,
): Promise<MatchContext | undefined> {
  const item = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.id, mediaId))
    .get()
  if (!item) return

  const library = await db
    .select({ type: libraries.type })
    .from(libraries)
    .where(eq(libraries.id, item.libraryId))
    .get()
  if (!library) return

  const mediaType = item.mediaType.split('/')[0] as MediaType.MainType
  return { item, libraryType: library.type, mediaType }
}

function applicablePlugins(
  context: MatchContext,
): PluginEntry<MetadataSourcePlugin>[] {
  return getPluginsByCategory<MetadataSourcePlugin>('MetadataSource')
    .filter((plugin) => plugin.status === 'active')
    .filter((plugin) =>
      plugin.manifest.libraryTypes.includes(context.libraryType),
    )
    .filter((plugin) => plugin.instance.mediaTypes.includes(context.mediaType))
}

function descriptor(
  plugin: PluginEntry<MetadataSourcePlugin>,
): MatchProviderDescriptor {
  const availability = plugin.instance.getSearchAvailability()
  return {
    id: plugin.manifest.id,
    name: plugin.manifest.displayName ?? plugin.manifest.name,
    priority: plugin.manifest.priority ?? 0,
    available: availability.available,
    ...(availability.reason && { reason: availability.reason }),
  }
}

function searchQuery(
  context: MatchContext,
  title: string,
): MetadataSearchQuery {
  const year = Number(
    context.item.fileMetadata.year ?? context.item.metadata.year,
  )
  return {
    title,
    ...(Number.isFinite(year) && year > 0 ? { year } : {}),
    libraryType: context.libraryType,
    mediaType: context.mediaType,
    limit: 10,
    fileMetadata: context.item.fileMetadata,
  }
}

export function getMatchProviders(
  context: MatchContext,
): MatchProviderDescriptor[] {
  return applicablePlugins(context).map(descriptor)
}

export async function searchMatches(
  context: MatchContext,
  title: string,
): Promise<MatchProviderResults[]> {
  const query = searchQuery(context, title)
  const plugins = applicablePlugins(context)

  return Promise.all(
    plugins.map(async (plugin): Promise<MatchProviderResults> => {
      const info = descriptor(plugin)
      if (!info.available) {
        return { ...info, status: 'unavailable', results: [] }
      }

      try {
        return {
          ...info,
          status: 'success',
          results: (await plugin.instance.search(query)).slice(0, query.limit),
        }
      } catch (error) {
        return {
          ...info,
          status: 'error',
          results: [],
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )
}

export async function applyMatch(
  db: LibSQLDatabase,
  context: MatchContext,
  providerId: string,
  matchId: string,
) {
  const plugins = applicablePlugins(context)
  const selected = plugins.find((plugin) => plugin.manifest.id === providerId)
  if (!selected) throw new Error('Selected metadata provider is unavailable')
  if (!selected.instance.getSearchAvailability().available) {
    throw new Error('Selected metadata provider is not configured')
  }

  const query = searchQuery(context, context.item.title)
  const selectedMetadata = await selected.instance.resolveMatch(matchId, query)
  if (!selectedMetadata) throw new Error('Selected match could not be resolved')

  let metadata: Metadata = selectedMetadata
  const warnings: Array<{ providerId: string; error: string }> = []

  for (const plugin of plugins) {
    if (plugin.manifest.id === selected.manifest.id) continue
    if (!plugin.instance.getSearchAvailability().available) continue

    try {
      const enriched = await plugin.instance.enrich(
        context.item.filePath,
        context.libraryType,
        {
          title:
            typeof metadata.title === 'string'
              ? metadata.title
              : context.item.title,
          fileMetadata: context.item.fileMetadata,
          metadata,
        },
      )
      if (enriched) {
        metadata = mergeMetadata(metadata, enriched)
      }
    } catch (error) {
      warnings.push({
        providerId: plugin.manifest.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const title =
    typeof metadata.title === 'string' && metadata.title.trim()
      ? metadata.title
      : context.item.title
  const updatedAt = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(mediaItems)
      .set({
        metadata,
        title,
        matchId,
        matchIdSource: selected.manifest.id,
        updatedAt,
      })
      .where(eq(mediaItems.id, context.item.id))
  })

  const item = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.id, context.item.id))
    .get()

  return { item, warnings }
}
