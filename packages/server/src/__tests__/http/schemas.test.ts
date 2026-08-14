import { describe, expect, it } from 'vitest'
import {
  listQuerySchema,
  mediaFilterQuerySchema,
  resourceIdParamsSchema,
} from '../../http/schemas.ts'

describe('shared request schemas', () => {
  const schema = listQuerySchema(['createdAt', 'title'] as const, {
    sortBy: 'createdAt',
    order: 'desc',
  })

  it('applies the shared pagination and sorting defaults', () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      order: 'desc',
    })
  })

  it.each([
    { page: '0' },
    { page: '1.5' },
    { limit: '0' },
    { limit: '101' },
    { sortBy: 'unknown' },
    { order: 'sideways' },
  ])('rejects invalid list input %#', (query) => {
    expect(schema.safeParse(query).success).toBe(false)
  })

  it('coerces valid query strings before route logic', () => {
    expect(
      schema.parse({ page: '2', limit: '50', sortBy: 'title', order: 'asc' }),
    ).toEqual({ page: 2, limit: 50, sortBy: 'title', order: 'asc' })
  })

  it('rejects empty path IDs', () => {
    expect(resourceIdParamsSchema.safeParse({ id: '' }).success).toBe(false)
  })

  it('coerces shared media filters and rejects invalid booleans', () => {
    expect(mediaFilterQuerySchema.parse({ unmatched: 'true' })).toEqual({
      unmatched: true,
    })
    expect(
      mediaFilterQuerySchema.safeParse({ unmatched: 'sometimes' }).success,
    ).toBe(false)
  })
})
