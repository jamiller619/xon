import { CollectionType, type MediaType } from '@xon/shared'
import { and, asc, count, desc, eq, inArray, isNull, like } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { alias } from 'drizzle-orm/sqlite-core'
import { publicMediaColumns } from '../db/publicSelections.ts'
import {
  collectionItems,
  collections,
  libraries,
  mediaItems,
} from '../db/schema.ts'
import { insertWithGeneratedPublicId } from '../lib/publicId.ts'

export const MANUAL_COLLECTION_TYPES = [
  CollectionType.Collection,
  CollectionType.Playlist,
  CollectionType.Album,
  CollectionType.Shelf,
  CollectionType.Folder,
] as const

type ManualCollectionType = (typeof MANUAL_COLLECTION_TYPES)[number]
type CollectionMediaSortKey = 'sortOrder' | 'title' | 'fileSize' | 'createdAt'

export type CollectionMediaQuery = {
  mediaType?: MediaType.MainType | undefined
  unmatched: boolean
  sortBy: CollectionMediaSortKey
  order: 'asc' | 'desc'
  page: number
  limit: number
}

export type CollectionUpdate = {
  title?: string | undefined
  type?: ManualCollectionType | undefined
}

export type CollectionItemOrder = {
  mediaItemId: string
  sortOrder: number
}

export async function createCollection(
  db: LibSQLDatabase,
  userId: number,
  input: { type: ManualCollectionType; title: string },
) {
  const created = await insertWithGeneratedPublicId(async (publicId) => {
    const [row] = await db
      .insert(collections)
      .values({
        publicId,
        userId,
        type: input.type,
        title: input.title,
        metadata: '{}',
        createdAt: new Date(),
      })
      .returning({ publicId: collections.publicId })
    return row
  })
  if (!created) throw new Error('Failed to create collection')

  const collection = await getPublicCollection(db, created.publicId, userId)
  if (!collection) throw new Error('Failed to load created collection')
  return collection
}

export function getPublicCollections(db: LibSQLDatabase, userId: number) {
  const parent = alias(collections, 'parent_collections')
  return db
    .select({
      id: collections.publicId,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      type: collections.type,
      title: collections.title,
      parentCollectionId: parent.publicId,
      metadata: collections.metadata,
    })
    .from(collections)
    .leftJoin(parent, eq(collections.parentCollectionId, parent.id))
    .where(eq(collections.userId, userId))
    .orderBy(asc(collections.createdAt))
}

export function getPublicCollection(
  db: LibSQLDatabase,
  publicId: string,
  userId: number,
) {
  const parent = alias(collections, 'parent_collection')
  return db
    .select({
      id: collections.publicId,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      type: collections.type,
      title: collections.title,
      parentCollectionId: parent.publicId,
      metadata: collections.metadata,
    })
    .from(collections)
    .leftJoin(parent, eq(collections.parentCollectionId, parent.id))
    .where(
      and(eq(collections.publicId, publicId), eq(collections.userId, userId)),
    )
    .get()
}

export async function getCollectionMedia(
  db: LibSQLDatabase,
  publicId: string,
  userId: number,
  query: CollectionMediaQuery,
) {
  const collection = await getOwnedCollection(db, publicId, userId)
  if (!collection) return { status: 'not_found' } as const

  const filters = and(
    eq(collectionItems.collectionId, collection.id),
    query.mediaType
      ? like(mediaItems.mediaType, `${query.mediaType}/%`)
      : undefined,
    query.unmatched ? isNull(mediaItems.matchId) : undefined,
  )
  const sortDirection = query.order === 'asc' ? asc : desc
  const sortColumn =
    query.sortBy === 'sortOrder'
      ? collectionItems.sortOrder
      : mediaItems[query.sortBy]

  const items = await db
    .select({ ...publicMediaColumns, libraryId: libraries.publicId })
    .from(collectionItems)
    .innerJoin(mediaItems, eq(collectionItems.mediaItemId, mediaItems.id))
    .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
    .where(filters)
    .orderBy(sortDirection(sortColumn), asc(mediaItems.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit)
  const totals = await db
    .select({ count: count() })
    .from(collectionItems)
    .innerJoin(mediaItems, eq(collectionItems.mediaItemId, mediaItems.id))
    .where(filters)

  return { status: 'ok', items, total: totals[0]?.count ?? 0 } as const
}

export async function updateCollection(
  db: LibSQLDatabase,
  publicId: string,
  userId: number,
  updates: CollectionUpdate,
) {
  const collection = await getOwnedCollection(db, publicId, userId)
  if (!collection) return { status: 'not_found' } as const
  if (!isManualCollectionType(collection.type)) {
    return { status: 'immutable' } as const
  }

  const values: CollectionUpdate = {}
  if (updates.title !== undefined) values.title = updates.title
  if (updates.type !== undefined) values.type = updates.type

  if (Object.keys(values).length > 0) {
    await db
      .update(collections)
      .set(values)
      .where(eq(collections.id, collection.id))
  }

  const updated = await getPublicCollection(db, publicId, userId)
  if (!updated) throw new Error('Failed to load updated collection')
  return { status: 'ok', collection: updated } as const
}

export async function deleteCollection(
  db: LibSQLDatabase,
  publicId: string,
  userId: number,
) {
  const collection = await getOwnedCollection(db, publicId, userId)
  if (!collection) return { status: 'not_found' } as const
  if (!isManualCollectionType(collection.type)) {
    return { status: 'immutable' } as const
  }

  await db.delete(collections).where(eq(collections.id, collection.id))
  return { status: 'ok' } as const
}

export async function addCollectionItem(
  db: LibSQLDatabase,
  collectionPublicId: string,
  userId: number,
  input: { mediaItemId: string; sortOrder?: number | undefined },
) {
  const collection = await getOwnedCollection(db, collectionPublicId, userId)
  if (!collection) return { status: 'collection_not_found' } as const

  const mediaItem = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(eq(mediaItems.publicId, input.mediaItemId))
    .get()
  if (!mediaItem) return { status: 'media_not_found' } as const

  const existingItem = await db
    .select({ mediaItemId: collectionItems.mediaItemId })
    .from(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, collection.id),
        eq(collectionItems.mediaItemId, mediaItem.id),
      ),
    )
    .get()

  let sortOrder = input.sortOrder
  if (sortOrder === undefined) {
    const existing = await db
      .select({ sortOrder: collectionItems.sortOrder })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, collection.id))
      .orderBy(asc(collectionItems.sortOrder))
    const last = existing[existing.length - 1]
    sortOrder = last ? last.sortOrder + 1 : 0
  }

  await db
    .insert(collectionItems)
    .values({
      collectionId: collection.id,
      mediaItemId: mediaItem.id,
      sortOrder,
    })
    .onConflictDoUpdate({
      target: [collectionItems.collectionId, collectionItems.mediaItemId],
      set: { sortOrder },
    })

  return {
    status: existingItem ? 'updated' : 'created',
    item: {
      collectionId: collection.publicId,
      mediaItemId: input.mediaItemId,
      sortOrder,
    },
  } as const
}

export async function reorderCollectionItems(
  db: LibSQLDatabase,
  collectionPublicId: string,
  userId: number,
  items: CollectionItemOrder[],
) {
  const collection = await getOwnedCollection(db, collectionPublicId, userId)
  if (!collection) return { status: 'collection_not_found' } as const

  const publicMediaIds = items.map(({ mediaItemId }) => mediaItemId)
  const mediaRows = publicMediaIds.length
    ? await db
        .select({ id: mediaItems.id, publicId: mediaItems.publicId })
        .from(mediaItems)
        .where(inArray(mediaItems.publicId, publicMediaIds))
    : []
  const mediaIdsByPublicId = new Map(
    mediaRows.map((item) => [item.publicId, item.id]),
  )

  if (items.length > 0) {
    if (mediaIdsByPublicId.size !== items.length) {
      return { status: 'items_not_found' } as const
    }
    const existingItems = await db
      .select({ mediaItemId: collectionItems.mediaItemId })
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.collectionId, collection.id),
          inArray(collectionItems.mediaItemId, [
            ...mediaIdsByPublicId.values(),
          ]),
        ),
      )
    if (existingItems.length !== items.length) {
      return { status: 'items_not_found' } as const
    }
  }

  await db.transaction(async (tx) => {
    for (const item of items) {
      const mediaItemId = mediaIdsByPublicId.get(item.mediaItemId)
      if (mediaItemId === undefined) continue
      await tx
        .update(collectionItems)
        .set({ sortOrder: item.sortOrder })
        .where(
          and(
            eq(collectionItems.collectionId, collection.id),
            eq(collectionItems.mediaItemId, mediaItemId),
          ),
        )
    }
  })

  return { status: 'ok' } as const
}

export async function removeCollectionItem(
  db: LibSQLDatabase,
  collectionPublicId: string,
  userId: number,
  mediaItemPublicId: string,
) {
  const collection = await getOwnedCollection(db, collectionPublicId, userId)
  if (!collection) return { status: 'collection_not_found' } as const

  const mediaItem = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(eq(mediaItems.publicId, mediaItemPublicId))
    .get()
  if (!mediaItem) return { status: 'media_not_found' } as const

  await db
    .delete(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, collection.id),
        eq(collectionItems.mediaItemId, mediaItem.id),
      ),
    )
  return { status: 'ok' } as const
}

function getOwnedCollection(
  db: LibSQLDatabase,
  publicId: string,
  userId: number,
) {
  return db
    .select()
    .from(collections)
    .where(
      and(eq(collections.publicId, publicId), eq(collections.userId, userId)),
    )
    .get()
}

function isManualCollectionType(
  type: CollectionType,
): type is ManualCollectionType {
  return (MANUAL_COLLECTION_TYPES as readonly CollectionType[]).includes(type)
}
