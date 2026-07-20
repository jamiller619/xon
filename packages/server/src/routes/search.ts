import { eq, type SQL, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
// import {
//   getAllowedRatings,
//   // libraryAccess,
//   users,
// } from '../db/schema.ts'
import { validate } from '../http/validate.ts'

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q is required'),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

const PRIVILEGED_ROLES = ['admin', 'manager'] as const

// async function getAccessibleLibraryIds(
//   db: LibSQLDatabase,
//   userId: string,
// ): Promise<string[] | null> {
//   const rows = await db
//     .select({ libraryId: libraryAccess.libraryId })
//     .from(libraryAccess)
//     .where(eq(libraryAccess.userId, userId))
//   return rows.map((r) => r.libraryId)
// }

interface SearchRow {
  id: string
  library_id: string
  title: string | null
  description: string | null
  file_name: string
  media_category: string | null
  content_rating: string | null
  thumbnail_paths: string | null
  created_at: number
  fts_rank: number
}

export function makeSearchRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  router.get('/', validate('query', searchQuerySchema), async (c) => {
    const {
      q,
      category,
      limit: limitNum,
      offset: offsetNum,
    } = c.req.valid('query')

    const user = c.get('user')

    // Get accessible library IDs for this user
    // const accessibleIds = await getAccessibleLibraryIds(db, user.id)
    // if (accessibleIds !== null && accessibleIds.length === 0) {
    //   return c.json({ results: [] })
    // }

    // Get user's content rating restriction
    // const userRows = await db
    //   .select({ maxContentRating: users.maxContentRating })
    //   .from(users)
    //   .where(eq(users.id, user.id))
    // const maxRating = userRows[0]?.maxContentRating ?? 'none'
    // const allowedRatings = getAllowedRatings(maxRating)

    // Build WHERE conditions for the raw SQL query
    const conditions: SQL[] = [sql`media_fts MATCH ${q}`]

    // if (accessibleIds !== null) {
    //   conditions.push(
    //     sql`m.library_id IN (${sql.join(
    //       accessibleIds.map((id) => sql`${id}`),
    //       sql`, `,
    //     )})`,
    //   )
    // }

    if (category) {
      conditions.push(sql`m.media_category = ${category}`)
    }

    // if (allowedRatings !== null) {
    //   if (allowedRatings.length === 0) {
    //     conditions.push(sql`m.content_rating IS NULL`)
    //   } else {
    //     const unratedAllowed = (allowedRatings as string[]).includes('unrated')
    //     if (unratedAllowed) {
    //       conditions.push(
    //         sql`(m.content_rating IS NULL OR m.content_rating IN (${sql.join(
    //           allowedRatings.map((r) => sql`${r}`),
    //           sql`, `,
    //         )}))`,
    //       )
    //     } else {
    //       conditions.push(
    //         sql`m.content_rating IN (${sql.join(
    //           allowedRatings.map((r) => sql`${r}`),
    //           sql`, `,
    //         )})`,
    //       )
    //     }
    //   }
    // }

    const whereClause = sql.join(conditions, sql` AND `)

    const rows = await db.all<SearchRow>(sql`
      SELECT
        m.id,
        m.library_id,
        m.title,
        m.description,
        m.file_name,
        m.media_category,
        m.content_rating,
        m.thumbnail_paths,
        m.created_at,
        fts.rank AS fts_rank
      FROM media_items m
      JOIN media_fts fts ON fts.id = m.id
      WHERE ${whereClause}
      ORDER BY fts_rank
      LIMIT ${limitNum} OFFSET ${offsetNum}
    `)

    const results = rows.map((row) => ({
      id: row.id,
      libraryId: row.library_id,
      title: row.title,
      description: row.description,
      fileName: row.file_name,
      mediaCategory: row.media_category,
      contentRating: row.content_rating,
      createdAt: row.created_at
        ? new Date(row.created_at * 1000).toISOString()
        : null,
      thumbnailUrls: row.thumbnail_paths
        ? {
            small: `/api/media/${row.id}/thumbnail?size=small`,
            medium: `/api/media/${row.id}/thumbnail?size=medium`,
            large: `/api/media/${row.id}/thumbnail?size=large`,
          }
        : null,
    }))

    return c.json({ results })
  })

  return router
}
