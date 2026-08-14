import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import { updateMedia } from '../../services/mediaMutationService.ts'

describe('mediaMutationService', () => {
  it('updates copied metadata without mutating the fetched object', async () => {
    const originalMetadata = { nested: { retained: true }, tags: ['old'] }
    const item = {
      id: 'media-1',
      title: 'Original',
      description: null,
      metadata: originalMetadata,
    }
    const db = {
      select: () => ({
        from: () => ({ where: async () => [item] }),
      }),
      update: () => ({
        set: (updates: Record<string, unknown>) => ({
          where: async () => Object.assign(item, updates),
        }),
      }),
    } as unknown as LibSQLDatabase

    const updated = await updateMedia(db, 'media-1', {
      title: 'Renamed',
      tags: ['new'],
    })

    expect(originalMetadata).toEqual({
      nested: { retained: true },
      tags: ['old'],
    })
    expect(updated).toMatchObject({
      title: 'Renamed',
      metadata: { nested: { retained: true }, tags: ['new'] },
    })
    expect(updated?.metadata).not.toBe(originalMetadata)
  })
})
