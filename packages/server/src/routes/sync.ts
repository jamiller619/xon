import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path, { join } from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { mediaItems, syncProfiles, syncRuns } from '../db/schema.js'
import { validate } from '../http/validate.js'

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const scopeSchema = z.object({
  libraryIds: z.array(z.string()).optional(),
  groupIds: z.array(z.string()).optional(),
  itemIds: z.array(z.string()).optional(),
  mediaTypes: z.array(z.string()).optional(),
})

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['full', 'partial']).default('full'),
  scope: scopeSchema.default({}),
  targetPath: z.string().min(1),
  includeMedia: z.boolean().default(false),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['full', 'partial']).optional(),
  scope: scopeSchema.optional(),
  targetPath: z.string().min(1).optional(),
  includeMedia: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Sync execution
// ---------------------------------------------------------------------------

export async function runSyncJob(
  db: LibSQLDatabase,
  runId: string,
): Promise<void> {
  const now = new Date()

  await db
    .update(syncRuns)
    .set({ status: 'running', startedAt: now })
    .where(eq(syncRuns.id, runId))

  const runRows = await db.select().from(syncRuns).where(eq(syncRuns.id, runId))
  const run = runRows[0]
  if (!run) return

  const profileRows = await db
    .select()
    .from(syncProfiles)
    .where(eq(syncProfiles.id, run.profileId))
  const profile = profileRows[0]
  if (!profile) {
    await db
      .update(syncRuns)
      .set({
        status: 'failed',
        errors: JSON.stringify(['Sync profile not found']),
        completedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId))
    return
  }

  let scope: z.infer<typeof scopeSchema> = {}
  try {
    scope = scopeSchema.parse(JSON.parse(profile.scope))
  } catch {
    scope = {}
  }

  const errors: string[] = []
  let synced = 0

  try {
    // Build query filters based on scope (for partial sync)
    const filters = []
    if (profile.type === 'partial') {
      if (scope.libraryIds && scope.libraryIds.length > 0) {
        filters.push(inArray(mediaItems.libraryId, scope.libraryIds))
      }
      if (scope.mediaTypes && scope.mediaTypes.length > 0) {
        // filters.push(inArray(mediaItems.mediaCategory, scope.mediaTypes))
      }
      if (scope.itemIds && scope.itemIds.length > 0) {
        filters.push(inArray(mediaItems.id, scope.itemIds))
      }
    }

    const items =
      filters.length > 0
        ? await db
            .select()
            .from(mediaItems)
            .where(and(...filters))
        : await db.select().from(mediaItems)

    await db
      .update(syncRuns)
      .set({ totalItems: items.length })
      .where(eq(syncRuns.id, runId))

    // Write metadata JSON
    await mkdir(profile.targetPath, { recursive: true })
    const metadataPath = join(profile.targetPath, 'metadata.json')
    await writeFile(metadataPath, JSON.stringify(items, null, 2), 'utf-8')
    synced++

    // Optionally copy media files
    if (profile.includeMedia) {
      const mediaDir = join(profile.targetPath, 'media')
      await mkdir(mediaDir, { recursive: true })
      for (const item of items) {
        try {
          const dest = join(mediaDir, path.basename(item.filePath))
          await copyFile(item.filePath, dest)
          synced++
        } catch (err) {
          errors.push(
            `${item.filePath}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    await db
      .update(syncRuns)
      .set({
        status: errors.length > 0 ? 'completed' : 'completed',
        syncedItems: synced,
        errors: JSON.stringify(errors),
        completedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db
      .update(syncRuns)
      .set({
        status: 'failed',
        errors: JSON.stringify([...errors, msg]),
        completedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId))
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function makeSyncRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  // GET /sync/profiles — list all profiles
  router.get('/', async (c) => {
    const rows = await db.select().from(syncProfiles)
    return c.json(rows)
  })

  // GET /sync/profiles/:id — get single profile
  router.get('/:id', async (c) => {
    const id = c.req.param('id') as string
    const rows = await db
      .select()
      .from(syncProfiles)
      .where(eq(syncProfiles.id, id))
    const row = rows[0]
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })

  // POST /sync/profiles — create profile
  router.post('/', validate('json', createSchema), async (c) => {
    const body = c.req.valid('json')
    const id = crypto.randomUUID()
    const now = new Date()
    const inserted = await db
      .insert(syncProfiles)
      .values({
        id,
        name: body.name,
        type: body.type,
        scope: JSON.stringify(body.scope),
        targetPath: body.targetPath,
        includeMedia: body.includeMedia,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    const row = inserted[0]
    if (!row) return c.json({ error: 'Insert failed' }, 500)
    return c.json(row, 201)
  })

  // PUT /sync/profiles/:id — update profile
  router.put('/:id', validate('json', updateSchema), async (c) => {
    const id = c.req.param('id') as string
    const body = c.req.valid('json')

    const existing = await db
      .select()
      .from(syncProfiles)
      .where(eq(syncProfiles.id, id))
    if (!existing[0]) return c.json({ error: 'Not found' }, 404)

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updates.name = body.name
    if (body.type !== undefined) updates.type = body.type
    if (body.scope !== undefined) updates.scope = JSON.stringify(body.scope)
    if (body.targetPath !== undefined) updates.targetPath = body.targetPath
    if (body.includeMedia !== undefined)
      updates.includeMedia = body.includeMedia

    const updated = await db
      .update(syncProfiles)
      .set(updates)
      .where(eq(syncProfiles.id, id))
      .returning()
    const row = updated[0]
    if (!row) return c.json({ error: 'Update failed' }, 500)
    return c.json(row)
  })

  // DELETE /sync/profiles/:id — delete profile
  router.delete('/:id', async (c) => {
    const id = c.req.param('id') as string
    const existing = await db
      .select()
      .from(syncProfiles)
      .where(eq(syncProfiles.id, id))
    if (!existing[0]) return c.json({ error: 'Not found' }, 404)
    await db.delete(syncProfiles).where(eq(syncProfiles.id, id))
    return c.body(null, 204)
  })

  // POST /sync/profiles/:id/run — execute sync
  router.post('/:id/run', async (c) => {
    const id = c.req.param('id') as string
    const profileRows = await db
      .select()
      .from(syncProfiles)
      .where(eq(syncProfiles.id, id))
    if (!profileRows[0]) return c.json({ error: 'Not found' }, 404)

    const runId = crypto.randomUUID()
    const now = new Date()
    await db.insert(syncRuns).values({
      id: runId,
      profileId: id,
      status: 'pending',
      createdAt: now,
    })

    runSyncJob(db, runId).catch(() => {})

    return c.json({ runId, status: 'running' }, 202)
  })

  // GET /sync/profiles/:id/runs — list runs for a profile
  router.get('/:id/runs', async (c) => {
    const id = c.req.param('id') as string
    const profileRows = await db
      .select()
      .from(syncProfiles)
      .where(eq(syncProfiles.id, id))
    if (!profileRows[0]) return c.json({ error: 'Not found' }, 404)
    const rows = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.profileId, id))
      .orderBy(desc(syncRuns.createdAt))
    return c.json(rows)
  })

  // GET /sync/runs/:id — get single run
  router.get('/runs/:id', async (c) => {
    const id = c.req.param('id') as string
    const rows = await db.select().from(syncRuns).where(eq(syncRuns.id, id))
    const row = rows[0]
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })

  return router
}
