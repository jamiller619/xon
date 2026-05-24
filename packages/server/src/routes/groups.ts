import { GroupType, UserRole } from '@xon/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireRole } from '../auth/rbac.ts'
import { groupItems, groups, mediaItems } from '../db/schema.ts'
import { validate } from '../http/validate.ts'

const MANUAL_GROUP_TYPES = [
  GroupType.Collection,
  GroupType.Playlist,
  GroupType.Album,
  GroupType.Shelf,
  GroupType.Folder,
] as const

const createGroupSchema = z.object({
  type: z.enum(MANUAL_GROUP_TYPES),
  title: z.string().min(1),
})

const updateGroupSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(MANUAL_GROUP_TYPES).optional(),
})

const addItemSchema = z.object({
  mediaItemId: z.string().min(1),
  sortOrder: z.number().int().optional(),
})

const reorderItemsSchema = z.object({
  items: z.array(
    z.object({
      mediaItemId: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ),
})

export function makeGroupsRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  // POST /groups — create a manual group (user+)
  router.post(
    '/',
    requireRole(UserRole.User),
    validate('json', createGroupSchema),
    async (c) => {
      const body = c.req.valid('json')
      const userId = c.get('user')?.id

      if (!userId) {
        return c.json({ error: 'Not authenticated' }, 401)
      }

      const id = crypto.randomUUID()

      await db.insert(groups).values({
        id,
        userId,
        type: body.type as GroupType,
        title: body.title,
        metadata: '{}',
        createdAt: new Date(),
      })

      const rows = await db.select().from(groups).where(eq(groups.id, id))

      return c.json(rows[0], 201)
    },
  )

  // GET /groups?libraryId=xxx — list manual groups for a library (access-checked)
  router.get('/', async (c) => {
    const user = c.get('user')
    // const libraryId = c.req.query('libraryId')
    // if (!libraryId)
    //   return c.json({ error: 'libraryId query param required' }, 400)

    // const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
    // if (accessibleIds !== null && !accessibleIds.includes(libraryId)) {
    //   return c.json({ error: 'Not found' }, 404)
    // }
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401)
    }

    const rows = await db
      .select()
      .from(groups)
      .where(eq(groups.userId, user.id))
      .orderBy(asc(groups.createdAt))

    return c.json(rows)
  })

  // GET /groups/:id — get group with members (access-checked)
  router.get('/:id', async (c) => {
    const id = c.req.param('id')
    // const user = c.get('user')

    const groupRows = await db.select().from(groups).where(eq(groups.id, id))
    if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404)
    const group = groupRows[0]
    if (!group) return c.json({ error: 'Not found' }, 404)

    // const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
    // if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
    //   return c.json({ error: 'Not found' }, 404)
    // }

    // Fetch members with media item details
    const members = await db
      .select({
        mediaItemId: groupItems.mediaItemId,
        sortOrder: groupItems.sortOrder,
        title: mediaItems.title,
        // mediaCategory: mediaItems.mediaCategory,
        mimeType: mediaItems.mimeType,
        fileSize: mediaItems.fileSize,
        createdAt: mediaItems.createdAt,
        // thumbnailPaths: mediaItems.thumbnailPaths,
      })
      .from(groupItems)
      .innerJoin(mediaItems, eq(groupItems.mediaItemId, mediaItems.id))
      .where(eq(groupItems.groupId, id))
      .orderBy(asc(groupItems.sortOrder))

    const membersWithThumbs = members.map((m) => {
      const thumbnailUrls: {
        small: string
        medium: string
        large: string
      } | null = null
      // if (m.thumbnailPaths) {
      //   try {
      //     const paths = JSON.parse(m.thumbnailPaths) as {
      //       small?: string
      //       medium?: string
      //       large?: string
      //     }
      //     if (paths.small && paths.medium && paths.large) {
      //       thumbnailUrls = {
      //         small: `/api/media/${m.mediaItemId}/thumbnail/small`,
      //         medium: `/api/media/${m.mediaItemId}/thumbnail/medium`,
      //         large: `/api/media/${m.mediaItemId}/thumbnail/large`,
      //       }
      //     }
      //   } catch {
      //     // ignore
      //   }
      // }
      return { ...m, thumbnailUrls, thumbnailPaths: undefined }
    })

    return c.json({ ...group, members: membersWithThumbs })
  })

  // PUT /groups/:id — update group title/type (manager+)
  router.put(
    '/:id',
    requireRole(UserRole.User),
    validate('json', updateGroupSchema),
    async (c) => {
      const id = c.req.param('id')
      const body = c.req.valid('json')
      // const user = c.get('user')

      const groupRows = await db.select().from(groups).where(eq(groups.id, id))
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404)
      const group = groupRows[0]
      if (!group) return c.json({ error: 'Not found' }, 404)

      // const accessibleIds = await getAccessibleLibraryIds(
      //   db,
      //   user.id,
      //   user.role,
      // )
      // if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }

      // Only allow updating manual group types
      if (!(MANUAL_GROUP_TYPES as readonly string[]).includes(group.type)) {
        return c.json({ error: 'Cannot update auto-generated group' }, 403)
      }

      const updates: Partial<typeof groups.$inferInsert> = {}
      if (body.title !== undefined) updates.title = body.title
      if (body.type !== undefined) updates.type = body.type

      if (Object.keys(updates).length > 0) {
        await db.update(groups).set(updates).where(eq(groups.id, id))
      }

      const updated = await db.select().from(groups).where(eq(groups.id, id))
      return c.json(updated[0])
    },
  )

  // DELETE /groups/:id — delete group (manager+)
  router.delete('/:id', requireRole(UserRole.User), async (c) => {
    const id = c.req.param('id')
    // const user = c.get('user')

    const groupRows = await db.select().from(groups).where(eq(groups.id, id))
    if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404)
    const group = groupRows[0]
    if (!group) return c.json({ error: 'Not found' }, 404)

    // const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
    // if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
    //   return c.json({ error: 'Not found' }, 404)
    // }

    // Only allow deleting manual group types
    if (!(MANUAL_GROUP_TYPES as readonly string[]).includes(group.type)) {
      return c.json({ error: 'Cannot delete auto-generated group' }, 403)
    }

    await db.delete(groups).where(eq(groups.id, id))
    return c.json({ success: true })
  })

  // POST /groups/:id/items — add item to group (upsert with sortOrder)
  router.post(
    '/:id/items',
    requireRole(UserRole.User),
    validate('json', addItemSchema),
    async (c) => {
      const groupId = c.req.param('id')
      const body = c.req.valid('json')
      // const user = c.get('user')

      const groupRows = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404)
      const group = groupRows[0]
      if (!group) return c.json({ error: 'Not found' }, 404)

      // const accessibleIds = await getAccessibleLibraryIds(
      //   db,
      //   user.id,
      //   user.role,
      // )
      // if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }

      // Verify media item exists and belongs to same library
      const itemRows = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.id, body.mediaItemId),
            // eq(mediaItems.libraryId, group.libraryId),
          ),
        )
      if (itemRows.length === 0)
        return c.json({ error: 'Media item not found' }, 404)

      // Determine sort order: use provided or append to end
      let sortOrder = body.sortOrder
      if (sortOrder === undefined) {
        const existing = await db
          .select({ sortOrder: groupItems.sortOrder })
          .from(groupItems)
          .where(eq(groupItems.groupId, groupId))
          .orderBy(asc(groupItems.sortOrder))
        const last = existing[existing.length - 1]
        sortOrder = last ? last.sortOrder + 1 : 0
      }

      await db
        .insert(groupItems)
        .values({ groupId, mediaItemId: body.mediaItemId, sortOrder })
        .onConflictDoUpdate({
          target: [groupItems.groupId, groupItems.mediaItemId],
          set: { sortOrder },
        })

      return c.json({ groupId, mediaItemId: body.mediaItemId, sortOrder }, 201)
    },
  )

  // PUT /groups/:id/items — reorder items (batch update sortOrder)
  router.put(
    '/:id/items',
    requireRole(UserRole.User),
    validate('json', reorderItemsSchema),
    async (c) => {
      const groupId = c.req.param('id')
      const body = c.req.valid('json')
      // const user = c.get('user')

      const groupRows = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404)
      const group = groupRows[0]
      if (!group) return c.json({ error: 'Not found' }, 404)

      // const accessibleIds = await getAccessibleLibraryIds(
      //   db,
      //   user.id,
      //   user.role,
      // )
      // if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }

      for (const item of body.items) {
        await db
          .update(groupItems)
          .set({ sortOrder: item.sortOrder })
          .where(
            and(
              eq(groupItems.groupId, groupId),
              eq(groupItems.mediaItemId, item.mediaItemId),
            ),
          )
      }

      return c.json({ success: true })
    },
  )

  // DELETE /groups/:id/items/:mediaItemId — remove item from group (manager+)
  router.delete(
    '/:id/items/:mediaItemId',
    requireRole(UserRole.User),
    async (c) => {
      const groupId = c.req.param('id')
      const mediaItemId = c.req.param('mediaItemId')
      // const user = c.get('user')

      const groupRows = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404)
      const group = groupRows[0]
      if (!group) return c.json({ error: 'Not found' }, 404)

      // const accessibleIds = await getAccessibleLibraryIds(
      //   db,
      //   user.id,
      //   user.role,
      // )
      // if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }

      await db
        .delete(groupItems)
        .where(
          and(
            eq(groupItems.groupId, groupId),
            eq(groupItems.mediaItemId, mediaItemId),
          ),
        )

      return c.json({ success: true })
    },
  )

  return router
}
