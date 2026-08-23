import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { sessions } from '../db/schema.ts'
import { normalizeSessionClientName } from './sessionClient.ts'
import { parseSessionDevice, type SessionDevice } from './sessionDevice.ts'

export const SESSION_ACTIVITY_WINDOW_MS = 5 * 60 * 1000

export type ClientSession = {
  id: string
  isCurrent: boolean
  clientName: string | null
  ipAddress: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  device: SessionDevice
}

export async function captureSessionClientName(
  db: LibSQLDatabase,
  sessionId: number,
  value: string | null | undefined,
): Promise<void> {
  const clientName = normalizeSessionClientName(value)
  if (!clientName) return

  await db
    .update(sessions)
    .set({ clientName })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.clientName)))
}

export async function touchSessionActivity(
  db: LibSQLDatabase,
  sessionId: number,
  now = new Date(),
): Promise<void> {
  const staleBefore = new Date(now.getTime() - SESSION_ACTIVITY_WINDOW_MS)

  await db
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(sessions.id, sessionId),
        or(isNull(sessions.lastSeenAt), lte(sessions.lastSeenAt, staleBefore)),
      ),
    )
}

export async function listActiveSessions(
  db: LibSQLDatabase,
  userId: number,
  currentSessionId: number,
  now = new Date(),
): Promise<ClientSession[]> {
  const rows = await db
    .select({
      internalId: sessions.id,
      id: sessions.publicId,
      clientName: sessions.clientName,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
    .orderBy(desc(sessions.lastSeenAt), desc(sessions.createdAt))

  return rows
    .map((session) => ({
      id: session.id,
      isCurrent: session.internalId === currentSessionId,
      clientName: session.clientName,
      ipAddress: session.ipAddress || null,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      device: parseSessionDevice(session.userAgent),
    }))
    .sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent))
}

export async function revokeOwnedSession(
  db: LibSQLDatabase,
  userId: number,
  sessionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.publicId, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id })

  return deleted.length > 0
}
