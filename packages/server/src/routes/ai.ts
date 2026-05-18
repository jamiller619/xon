import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  duplicateCandidates,
  libraries,
  libraryAccess,
  mediaItems,
  suggestedGroups,
} from '../db/schema.js'
import { validate } from '../http/validate.js'
import { scanLibraryForDuplicates } from '../media/perceptualHash.js'
import {
  acceptSuggestedGroup,
  scanLibraryForSmartGroups,
} from '../media/smartGrouping.js'
// import { withThumbnailUrls } from './media.js'

const PRIVILEGED_ROLES = ['admin', 'manager'] as const

async function getAccessibleLibraryIds(
  db: LibSQLDatabase,
  userId: string,
  role: string,
): Promise<string[] | null> {
  if ((PRIVILEGED_ROLES as readonly string[]).includes(role)) return null
  const rows = await db
    .select({ libraryId: libraryAccess.libraryId })
    .from(libraryAccess)
    .where(eq(libraryAccess.userId, userId))
  return rows.map((r) => r.libraryId)
}

export function makeAiRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  /**
   * GET /ai/duplicates
   * Returns pending duplicate candidate pairs for review.
   * Supports ?libraryId, ?minSimilarity (0–100), ?limit, ?offset query params.
   */
  router.get('/duplicates', async (c) => {
    const user = c.get('user')
    const limitNum = Math.min(
      Math.max(1, Number(c.req.query('limit') || 20)),
      100,
    )
    const offsetNum = Math.max(0, Number(c.req.query('offset') || 0))
    const minSimilarity = Math.min(
      100,
      Math.max(0, Number(c.req.query('minSimilarity') || 50)),
    )
    const libraryIdFilter = c.req.query('libraryId')

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)

    const conditions = [
      eq(duplicateCandidates.status, 'pending'),
      gte(duplicateCandidates.similarity, minSimilarity),
    ]

    if (accessibleIds !== null) {
      conditions.push(inArray(duplicateCandidates.libraryId, accessibleIds))
    }

    if (libraryIdFilter) {
      // Extra filter: only this library (but still respect access control)
      if (accessibleIds !== null && !accessibleIds.includes(libraryIdFilter)) {
        return c.json({ items: [], limit: limitNum, offset: offsetNum })
      }
      conditions.push(eq(duplicateCandidates.libraryId, libraryIdFilter))
    }

    const rows = await db
      .select({
        candidate: duplicateCandidates,
        item1: {
          id: mediaItems.id,
          title: mediaItems.title,
          filePath: mediaItems.filePath,
          // fileName: mediaItems.fileName,
          fileSize: mediaItems.fileSize,
          mimeType: mediaItems.mimeType,
          // mediaCategory: mediaItems.mediaCategory,
          metadata: mediaItems.metadata,
          libraryId: mediaItems.libraryId,
          drmProtected: mediaItems.drmProtected,
          // dataSourceId: mediaItems.dataSourceId,
          description: mediaItems.description,
          // contentRating: mediaItems.contentRating,
          scannedAt: mediaItems.scannedAt,
          createdAt: mediaItems.createdAt,
          updatedAt: mediaItems.updatedAt,
        },
      })
      .from(duplicateCandidates)
      .innerJoin(
        mediaItems,
        eq(duplicateCandidates.mediaItemId1, mediaItems.id),
      )
      .where(and(...conditions))
      .orderBy(desc(duplicateCandidates.similarity))
      .limit(limitNum)
      .offset(offsetNum)

    // Fetch second media items
    const candidateIds = rows.map((r) => r.candidate.mediaItemId2)
    const item2Map = new Map<string, typeof mediaItems.$inferSelect>()
    if (candidateIds.length > 0) {
      const item2Rows = await db
        .select()
        .from(mediaItems)
        .where(inArray(mediaItems.id, candidateIds))
      for (const item of item2Rows) {
        item2Map.set(item.id, item)
      }
    }

    const items = rows.map(({ candidate, item1 }) => {
      const item2 = item2Map.get(candidate.mediaItemId2)
      return {
        ...candidate,
        mediaItem1: item1,
        mediaItem2: item2,
        // mediaItem1: withThumbnailUrls(item1 as typeof mediaItems.$inferSelect),
        // mediaItem2: item2 ? withThumbnailUrls(item2) : null,
      }
    })

    return c.json({ items, limit: limitNum, offset: offsetNum })
  })

  /**
   * POST /ai/duplicates/scan
   * Trigger a duplicate scan for a specific library.
   * Admin/manager only (requires libraryId in body).
   */
  const scanSchema = z.object({
    libraryId: z.string().min(1),
    threshold: z.number().int().min(0).max(64).optional(),
  })

  router.post('/duplicates/scan', validate('json', scanSchema), async (c) => {
    const user = c.get('user')
    const { libraryId, threshold } = c.req.valid('json')

    // Verify access
    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
    if (accessibleIds !== null && !accessibleIds.includes(libraryId)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Verify library exists
    const libRows = await db
      .select()
      .from(libraries)
      .where(eq(libraries.id, libraryId))
    if (libRows.length === 0) {
      return c.json({ error: 'Library not found' }, 404)
    }

    const found = await scanLibraryForDuplicates(db, libraryId, threshold ?? 10)
    return c.json({ found })
  })

  /**
   * POST /ai/duplicates/:id/resolve
   * Resolve a duplicate candidate pair.
   * Actions: keep_both | keep_first | keep_second
   * - keep_first: removes mediaItem2 from DB (not disk)
   * - keep_second: removes mediaItem1 from DB (not disk)
   * - keep_both: marks as reviewed, keeps both
   */
  const resolveSchema = z.object({
    action: z.enum(['keep_both', 'keep_first', 'keep_second']),
  })

  router.post('/:id/resolve', validate('json', resolveSchema), async (c) => {
    const { id } = c.req.param()
    const { action } = c.req.valid('json')
    const user = c.get('user')

    const rows = await db
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.id, id))
    if (rows.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }
    const candidate = rows[0]
    if (!candidate) {
      return c.json({ error: 'Not found' }, 404)
    }
    if (candidate.status !== 'pending') {
      return c.json({ error: 'Candidate is not pending' }, 409)
    }

    // Verify access
    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
    if (
      accessibleIds !== null &&
      !accessibleIds.includes(candidate.libraryId)
    ) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    if (action === 'keep_first') {
      // Remove mediaItem2 from DB (metadata only, not file on disk)
      await db
        .delete(mediaItems)
        .where(eq(mediaItems.id, candidate.mediaItemId2))
    } else if (action === 'keep_second') {
      await db
        .delete(mediaItems)
        .where(eq(mediaItems.id, candidate.mediaItemId1))
    }

    const newStatus =
      action === 'keep_both'
        ? 'kept_both'
        : action === 'keep_first'
          ? 'kept_first'
          : 'kept_second'

    const updated = await db
      .update(duplicateCandidates)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(duplicateCandidates.id, id))
      .returning()

    return c.json(updated[0])
  })

  // ─── Suggested Groups ─────────────────────────────────────────────────────

  /**
   * GET /ai/suggested-groups
   * Returns suggested groups (scattered files that belong together).
   * Supports ?libraryId, ?status (default "pending"), ?limit, ?offset.
   */
  router.get('/suggested-groups', async (c) => {
    const user = c.get('user')
    const limitNum = Math.min(
      Math.max(1, Number(c.req.query('limit') || 20)),
      100,
    )
    const offsetNum = Math.max(0, Number(c.req.query('offset') || 0))
    const statusFilter = c.req.query('status') ?? 'pending'
    const libraryIdFilter = c.req.query('libraryId')

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)

    const conditions = []

    if (
      statusFilter === 'pending' ||
      statusFilter === 'accepted' ||
      statusFilter === 'rejected'
    ) {
      conditions.push(eq(suggestedGroups.status, statusFilter))
    }

    if (accessibleIds !== null) {
      conditions.push(inArray(suggestedGroups.libraryId, accessibleIds))
    }

    if (libraryIdFilter) {
      if (accessibleIds !== null && !accessibleIds.includes(libraryIdFilter)) {
        return c.json({ items: [], limit: limitNum, offset: offsetNum })
      }
      conditions.push(eq(suggestedGroups.libraryId, libraryIdFilter))
    }

    const rows = await db
      .select()
      .from(suggestedGroups)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(suggestedGroups.confidence))
      .limit(limitNum)
      .offset(offsetNum)

    return c.json({ items: rows, limit: limitNum, offset: offsetNum })
  })

  /**
   * POST /ai/suggested-groups/scan
   * Trigger smart grouping scan for a library. Admin/manager only.
   */
  const smartScanSchema = z.object({ libraryId: z.string().min(1) })

  router.post(
    '/suggested-groups/scan',
    validate('json', smartScanSchema),
    async (c) => {
      const user = c.get('user')
      const { libraryId } = c.req.valid('json')

      const accessibleIds = await getAccessibleLibraryIds(
        db,
        user.id,
        user.role,
      )
      if (accessibleIds !== null && !accessibleIds.includes(libraryId)) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      const libRows = await db
        .select()
        .from(libraries)
        .where(eq(libraries.id, libraryId))
      if (libRows.length === 0) {
        return c.json({ error: 'Library not found' }, 404)
      }

      const found = await scanLibraryForSmartGroups(db, libraryId)
      return c.json({ found })
    },
  )

  /**
   * POST /ai/suggested-groups/:id/accept
   * Accept a suggestion: creates a real group and marks suggestion accepted.
   */
  router.post('/suggested-groups/:id/accept', async (c) => {
    const { id } = c.req.param()
    const user = c.get('user')

    const rows = await db
      .select()
      .from(suggestedGroups)
      .where(eq(suggestedGroups.id, id))
    if (rows.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }
    const suggestion = rows[0]
    if (!suggestion) {
      return c.json({ error: 'Not found' }, 404)
    }
    if (suggestion.status !== 'pending') {
      return c.json({ error: 'Suggestion is not pending' }, 409)
    }

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
    if (
      accessibleIds !== null &&
      !accessibleIds.includes(suggestion.libraryId)
    ) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const result = await acceptSuggestedGroup(db, id)
    if (!result) {
      return c.json({ error: 'Could not accept suggestion' }, 409)
    }

    return c.json({ groupId: result.groupId })
  })

  /**
   * POST /ai/suggested-groups/:id/reject
   * Reject a suggestion: marks it as rejected without creating a group.
   */
  router.post('/suggested-groups/:id/reject', async (c) => {
    const { id } = c.req.param()
    const user = c.get('user')

    const rows = await db
      .select()
      .from(suggestedGroups)
      .where(eq(suggestedGroups.id, id))
    if (rows.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }
    const suggestion = rows[0]
    if (!suggestion) {
      return c.json({ error: 'Not found' }, 404)
    }
    if (suggestion.status !== 'pending') {
      return c.json({ error: 'Suggestion is not pending' }, 409)
    }

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
    if (
      accessibleIds !== null &&
      !accessibleIds.includes(suggestion.libraryId)
    ) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const updated = await db
      .update(suggestedGroups)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(suggestedGroups.id, id))
      .returning()

    return c.json(updated[0])
  })

  return router
}
