import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMediaById = vi.hoisted(() => vi.fn())
const getMediaByIdWithLibrary = vi.hoisted(() => vi.fn())

vi.mock('../../services/mediaService.ts', () => ({
  getMediaById,
  getMediaByIdWithLibrary,
}))

const { getMediaDetail } = await import('../../services/mediaDetailService.ts')

describe('mediaDetailService', () => {
  beforeEach(() => {
    getMediaById.mockReset()
    getMediaByIdWithLibrary.mockReset()
  })

  it('returns anonymous detail without querying collection membership', async () => {
    const updatedAt = new Date('2026-08-14T12:00:00.000Z')
    getMediaById.mockResolvedValue({ id: 'media-1', updatedAt })
    const db = collectionDatabase(() => {
      throw new Error('collection query should not run')
    })

    const result = await getMediaDetail(db, 'media-1', {
      withLibrary: false,
    })

    expect(result).toEqual({
      data: { id: 'media-1', updatedAt, collectionIds: [] },
      etagSource: [updatedAt.getTime(), []],
    })
    expect(getMediaById).toHaveBeenCalledWith(db, 'media-1')
  })

  it('returns sorted current-user collection ids with the ETag source', async () => {
    const updatedAt = new Date('2026-08-14T12:00:00.000Z')
    getMediaByIdWithLibrary.mockResolvedValue({ id: 'media-1', updatedAt })
    const db = collectionDatabase(() => [
      { collectionId: 'collection-a' },
      { collectionId: 'collection-b' },
    ])

    const result = await getMediaDetail(db, 'media-1', {
      withLibrary: true,
      userId: 'user-1',
    })

    expect(result?.data.collectionIds).toEqual(['collection-a', 'collection-b'])
    expect(result?.etagSource).toEqual([
      updatedAt.getTime(),
      ['collection-a', 'collection-b'],
    ])
    expect(getMediaByIdWithLibrary).toHaveBeenCalledWith(db, 'media-1')
  })
})

function collectionDatabase(
  rows: () => { collectionId: string }[],
): LibSQLDatabase {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ orderBy: rows }),
        }),
      }),
    }),
  } as unknown as LibSQLDatabase
}
