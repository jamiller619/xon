import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { mediaItems } from '../db/schema.ts'
import { resolveMediaItemFilePath } from '../media/mediaFilePaths.ts'
import { openInFileBrowser } from '../services/openDirectoryService.ts'

export function makeOpenDirectoryRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  router.get('/:mediaId', async (c) => {
    const mediaId = c.req.param('mediaId')
    const media = await db
      .select({
        libraryId: mediaItems.libraryId,
        dataSourceId: mediaItems.dataSourceId,
        filePath: mediaItems.filePath,
      })
      .from(mediaItems)
      .where(eq(mediaItems.id, mediaId))
      .get()

    if (!media) {
      return c.json({ error: 'Media not found' }, 404)
    }

    await openInFileBrowser(await resolveMediaItemFilePath(db, media))

    c.header('Cache-Control', 'no-store')
    return c.body(null, 204)
  })

  return router
}
