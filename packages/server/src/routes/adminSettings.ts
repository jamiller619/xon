import { Hono } from 'hono'
import { configSchema } from '../config.ts'
// import { z } from 'zod'
// import { serverSettings } from '../db/schema.ts'
import { validate } from '../http/validate.ts'

// const THUMBNAIL_SIZE_OPTIONS = ['small', 'medium', 'large', 'xlarge'] as const
// type ThumbnailSize = (typeof THUMBNAIL_SIZE_OPTIONS)[number]

// const configSchema = z.object({
//   serverPort: z.number().int().min(1).max(65535).optional(),
//   dataDirectory: z.string().min(1).optional(),
//   defaultScanSchedule: z.string().nullable().optional(),
//   thumbnailSizes: z.array(z.enum(THUMBNAIL_SIZE_OPTIONS)).min(1).optional(),
// })

// async function getOrInitSettings(db: LibSQLDatabase) {
//   const rows = await db
//     .select()
//     .from(serverSettings)
//     .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
//   if (rows.length > 0) return rows[0]
//   await db
//     .insert(serverSettings)
//     .values({ id: SERVER_SETTINGS_ID })
//     .onConflictDoNothing()
//   const fresh = await db
//     .select()
//     .from(serverSettings)
//     .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
//   return fresh[0] ?? null
// }

// function formatSettings(
//   row: NonNullable<Awaited<ReturnType<typeof getOrInitSettings>>>,
// ) {
//   return {
//     serverPort: row.serverPort,
//     dataDirectory: row.dataDirectory,
//     defaultScanSchedule: row.defaultScanSchedule ?? null,
//     thumbnailSizes: JSON.parse(row.thumbnailSizes) as ThumbnailSize[],
//     updatedAt: row.updatedAt,
//   }
// }

export function makeAdminSettingsRouter(): Hono {
  const router = new Hono()

  /**
   * GET /admin/settings
   * Returns server configuration settings (port, data dir, scan schedule, thumbnail sizes).
   * Settings that require a restart are flagged with requiresRestart.
   */
  router.get('/', async (c) => {
    // const row = await getOrInitSettings(db)
    // if (!row) return c.json({ error: 'Settings not found' }, 500)
    // return c.json({ ...formatSettings(row), requiresRestart: false })
  })

  /**
   * PUT /admin/settings
   * Updates server configuration settings. Returns requiresRestart=true when
   * serverPort or dataDirectory was changed (those require a server restart).
   */
  router.put('/', validate('json', configSchema), async (c) => {
    // const body = c.req.valid('json')
    // const current = await getOrInitSettings(db)
    // if (!current) return c.json({ error: 'Settings not found' }, 500)
    // const update: Partial<typeof serverSettings.$inferInsert> = {
    //   updatedAt: new Date(),
    // }
    // let requiresRestart = false
    // if (body.serverPort !== undefined) {
    //   update.serverPort = body.serverPort
    //   if (body.serverPort !== current.serverPort) requiresRestart = true
    // }
    // if (body.dataDirectory !== undefined) {
    //   update.dataDirectory = body.dataDirectory
    //   if (body.dataDirectory !== current.dataDirectory) requiresRestart = true
    // }
    // if (body.defaultScanSchedule !== undefined) {
    //   if (body.defaultScanSchedule === null) update.defaultScanSchedule = null
    //   else update.defaultScanSchedule = body.defaultScanSchedule
    // }
    // if (body.thumbnailSizes !== undefined) {
    //   update.thumbnailSizes = JSON.stringify(body.thumbnailSizes)
    // }
    // const updated = await db
    //   .update(serverSettings)
    //   .set(update)
    //   .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
    //   .returning()
    // const row = updated[0]
    // if (!row) return c.json({ error: 'Update failed' }, 500)
    // return c.json({ ...formatSettings(row), requiresRestart })
  })

  return router
}
