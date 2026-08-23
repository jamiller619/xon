import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { mediaItems, mediaPlayStates, users } from '../db/schema.ts'

export interface MediaPlayStateInput {
  position: number
  duration?: number | undefined
  status: 'playing' | 'stopped' | 'completed'
}

export async function saveMediaPlayState(
  db: LibSQLDatabase,
  userId: number,
  mediaItemId: string,
  input: MediaPlayStateInput,
) {
  const item = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(eq(mediaItems.publicId, mediaItemId))
    .limit(1)
  if (!item[0]) return undefined

  const now = new Date()
  const values = {
    userId,
    mediaItemId: item[0].id,
    position: Math.floor(input.position),
    duration: input.duration === undefined ? null : Math.floor(input.duration),
    status: input.status,
    updatedAt: now,
    stoppedAt: input.status === 'playing' ? null : now,
  }
  const durationUpdate =
    values.duration === null ? {} : { duration: values.duration }

  await db
    .insert(mediaPlayStates)
    .values(values)
    .onConflictDoUpdate({
      target: [mediaPlayStates.userId, mediaPlayStates.mediaItemId],
      set: {
        position: values.position,
        ...durationUpdate,
        status: values.status,
        updatedAt: values.updatedAt,
        stoppedAt: values.stoppedAt,
      },
    })

  const state = await db
    .select()
    .from(mediaPlayStates)
    .where(
      and(
        eq(mediaPlayStates.userId, userId),
        eq(mediaPlayStates.mediaItemId, item[0].id),
      ),
    )
    .limit(1)

  if (!state[0]) return undefined

  const user = await db
    .select({ publicId: users.publicId })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (!user) return undefined

  return {
    ...state[0],
    userId: user.publicId,
    mediaItemId,
  }
}
