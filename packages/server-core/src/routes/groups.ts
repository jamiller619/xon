import { and, asc, eq, inArray } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../auth/rbac.js';
import { groupMembers, groups, libraryAccess, mediaItems } from '../db/schema.js';
import { validate } from '../http/validate.js';

const PRIVILEGED_ROLES = ['admin', 'manager'] as const;

async function getAccessibleLibraryIds(
  db: LibSQLDatabase,
  userId: string,
  role: string,
): Promise<string[] | null> {
  if ((PRIVILEGED_ROLES as readonly string[]).includes(role)) return null;
  const rows = await db
    .select({ libraryId: libraryAccess.libraryId })
    .from(libraryAccess)
    .where(eq(libraryAccess.userId, userId));
  return rows.map((r) => r.libraryId);
}

const MANUAL_GROUP_TYPES = [
  'collection',
  'playlist',
  'album',
  'shelf',
  'folder',
] as const;
type ManualGroupType = (typeof MANUAL_GROUP_TYPES)[number];

const createGroupSchema = z.object({
  libraryId: z.string().min(1),
  type: z.enum(MANUAL_GROUP_TYPES),
  title: z.string().min(1),
});

const updateGroupSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(MANUAL_GROUP_TYPES).optional(),
});

const addItemSchema = z.object({
  mediaItemId: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

const reorderItemsSchema = z.object({
  items: z.array(
    z.object({
      mediaItemId: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ),
});

export function makeGroupsRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // POST /groups — create a manual group (manager+)
  router.post(
    '/',
    requireRole('manager'),
    validate('json', createGroupSchema),
    async (c) => {
      const body = c.req.valid('json');
      const id = `grp:manual:${body.libraryId}:${crypto.randomUUID()}`;
      await db.insert(groups).values({
        id,
        libraryId: body.libraryId,
        type: body.type as ManualGroupType,
        title: body.title,
        metadata: '{}',
        createdAt: new Date(),
      });
      const rows = await db.select().from(groups).where(eq(groups.id, id));
      return c.json(rows[0], 201);
    },
  );

  // GET /groups?libraryId=xxx — list manual groups for a library (access-checked)
  router.get('/', async (c) => {
    const user = c.get('user');
    const libraryId = c.req.query('libraryId');
    if (!libraryId)
      return c.json({ error: 'libraryId query param required' }, 400);

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role);
    if (accessibleIds !== null && !accessibleIds.includes(libraryId)) {
      return c.json({ error: 'Not found' }, 404);
    }

    const rows = await db
      .select()
      .from(groups)
      .where(
        and(
          eq(groups.libraryId, libraryId),
          inArray(groups.type, [...MANUAL_GROUP_TYPES]),
        ),
      )
      .orderBy(asc(groups.createdAt));
    return c.json(rows);
  });

  // GET /groups/:id — get group with members (access-checked)
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const groupRows = await db.select().from(groups).where(eq(groups.id, id));
    if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404);
    const group = groupRows[0];
    if (!group) return c.json({ error: 'Not found' }, 404);

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role);
    if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Fetch members with media item details
    const members = await db
      .select({
        mediaItemId: groupMembers.mediaItemId,
        sortOrder: groupMembers.sortOrder,
        title: mediaItems.title,
        mediaCategory: mediaItems.mediaCategory,
        mimeType: mediaItems.mimeType,
        fileSize: mediaItems.fileSize,
        createdAt: mediaItems.createdAt,
        thumbnailPaths: mediaItems.thumbnailPaths,
      })
      .from(groupMembers)
      .innerJoin(mediaItems, eq(groupMembers.mediaItemId, mediaItems.id))
      .where(eq(groupMembers.groupId, id))
      .orderBy(asc(groupMembers.sortOrder));

    const membersWithThumbs = members.map((m) => {
      let thumbnailUrls: {
        small: string;
        medium: string;
        large: string;
      } | null = null;
      if (m.thumbnailPaths) {
        try {
          const paths = JSON.parse(m.thumbnailPaths) as {
            small?: string;
            medium?: string;
            large?: string;
          };
          if (paths.small && paths.medium && paths.large) {
            thumbnailUrls = {
              small: `/api/v1/media/${m.mediaItemId}/thumbnail/small`,
              medium: `/api/v1/media/${m.mediaItemId}/thumbnail/medium`,
              large: `/api/v1/media/${m.mediaItemId}/thumbnail/large`,
            };
          }
        } catch {
          // ignore
        }
      }
      return { ...m, thumbnailUrls, thumbnailPaths: undefined };
    });

    return c.json({ ...group, members: membersWithThumbs });
  });

  // PUT /groups/:id — update group title/type (manager+)
  router.put(
    '/:id',
    requireRole('manager'),
    validate('json', updateGroupSchema),
    async (c) => {
      const id = c.req.param('id');
      const body = c.req.valid('json');
      const user = c.get('user');

      const groupRows = await db.select().from(groups).where(eq(groups.id, id));
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404);
      const group = groupRows[0];
      if (!group) return c.json({ error: 'Not found' }, 404);

      const accessibleIds = await getAccessibleLibraryIds(
        db,
        user.id,
        user.role,
      );
      if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
        return c.json({ error: 'Not found' }, 404);
      }

      // Only allow updating manual group types
      if (!(MANUAL_GROUP_TYPES as readonly string[]).includes(group.type)) {
        return c.json({ error: 'Cannot update auto-generated group' }, 403);
      }

      const updates: Partial<typeof groups.$inferInsert> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.type !== undefined) updates.type = body.type;

      if (Object.keys(updates).length > 0) {
        await db.update(groups).set(updates).where(eq(groups.id, id));
      }

      const updated = await db.select().from(groups).where(eq(groups.id, id));
      return c.json(updated[0]);
    },
  );

  // DELETE /groups/:id — delete group (manager+)
  router.delete('/:id', requireRole('manager'), async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const groupRows = await db.select().from(groups).where(eq(groups.id, id));
    if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404);
    const group = groupRows[0];
    if (!group) return c.json({ error: 'Not found' }, 404);

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role);
    if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Only allow deleting manual group types
    if (!(MANUAL_GROUP_TYPES as readonly string[]).includes(group.type)) {
      return c.json({ error: 'Cannot delete auto-generated group' }, 403);
    }

    await db.delete(groups).where(eq(groups.id, id));
    return c.json({ success: true });
  });

  // POST /groups/:id/items — add item to group (upsert with sortOrder)
  router.post(
    '/:id/items',
    requireRole('manager'),
    validate('json', addItemSchema),
    async (c) => {
      const groupId = c.req.param('id');
      const body = c.req.valid('json');
      const user = c.get('user');

      const groupRows = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId));
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404);
      const group = groupRows[0];
      if (!group) return c.json({ error: 'Not found' }, 404);

      const accessibleIds = await getAccessibleLibraryIds(
        db,
        user.id,
        user.role,
      );
      if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
        return c.json({ error: 'Not found' }, 404);
      }

      // Verify media item exists and belongs to same library
      const itemRows = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.id, body.mediaItemId),
            eq(mediaItems.libraryId, group.libraryId),
          ),
        );
      if (itemRows.length === 0)
        return c.json({ error: 'Media item not found' }, 404);

      // Determine sort order: use provided or append to end
      let sortOrder = body.sortOrder;
      if (sortOrder === undefined) {
        const existing = await db
          .select({ sortOrder: groupMembers.sortOrder })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, groupId))
          .orderBy(asc(groupMembers.sortOrder));
        const last = existing[existing.length - 1];
        sortOrder = last ? last.sortOrder + 1 : 0;
      }

      await db
        .insert(groupMembers)
        .values({ groupId, mediaItemId: body.mediaItemId, sortOrder })
        .onConflictDoUpdate({
          target: [groupMembers.groupId, groupMembers.mediaItemId],
          set: { sortOrder },
        });

      return c.json({ groupId, mediaItemId: body.mediaItemId, sortOrder }, 201);
    },
  );

  // PUT /groups/:id/items — reorder items (batch update sortOrder)
  router.put(
    '/:id/items',
    requireRole('manager'),
    validate('json', reorderItemsSchema),
    async (c) => {
      const groupId = c.req.param('id');
      const body = c.req.valid('json');
      const user = c.get('user');

      const groupRows = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId));
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404);
      const group = groupRows[0];
      if (!group) return c.json({ error: 'Not found' }, 404);

      const accessibleIds = await getAccessibleLibraryIds(
        db,
        user.id,
        user.role,
      );
      if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
        return c.json({ error: 'Not found' }, 404);
      }

      for (const item of body.items) {
        await db
          .update(groupMembers)
          .set({ sortOrder: item.sortOrder })
          .where(
            and(
              eq(groupMembers.groupId, groupId),
              eq(groupMembers.mediaItemId, item.mediaItemId),
            ),
          );
      }

      return c.json({ success: true });
    },
  );

  // DELETE /groups/:id/items/:mediaItemId — remove item from group (manager+)
  router.delete(
    '/:id/items/:mediaItemId',
    requireRole('manager'),
    async (c) => {
      const groupId = c.req.param('id');
      const mediaItemId = c.req.param('mediaItemId');
      const user = c.get('user');

      const groupRows = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId));
      if (groupRows.length === 0) return c.json({ error: 'Not found' }, 404);
      const group = groupRows[0];
      if (!group) return c.json({ error: 'Not found' }, 404);

      const accessibleIds = await getAccessibleLibraryIds(
        db,
        user.id,
        user.role,
      );
      if (accessibleIds !== null && !accessibleIds.includes(group.libraryId)) {
        return c.json({ error: 'Not found' }, 404);
      }

      await db
        .delete(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.mediaItemId, mediaItemId),
          ),
        );

      return c.json({ success: true });
    },
  );

  return router;
}
