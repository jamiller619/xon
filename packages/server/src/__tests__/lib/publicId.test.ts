import { describe, expect, it, vi } from 'vitest'
import {
  generatePublicId,
  insertWithGeneratedPublicId,
  isGeneratedPublicId,
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  PUBLIC_ID_MAX_INSERT_ATTEMPTS,
} from '../../lib/publicId.ts'

describe('public IDs', () => {
  it('uses the approved alphabet and length at runtime', () => {
    const ids = Array.from({ length: 100 }, () => generatePublicId())

    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toHaveLength(PUBLIC_ID_LENGTH)
      expect(isGeneratedPublicId(id)).toBe(true)
      expect(
        [...id].every((character) => PUBLIC_ID_ALPHABET.includes(character)),
      ).toBe(true)
    }
  })

  it('retries a public-id collision and then succeeds', async () => {
    const generate = vi
      .fn()
      .mockReturnValueOnce('first')
      .mockReturnValueOnce('second')
    const insert = vi
      .fn<(publicId: string) => Promise<string>>()
      .mockRejectedValueOnce(
        new Error('UNIQUE constraint failed: widgets.public_id'),
      )
      .mockImplementation(async (publicId) => publicId)

    await expect(insertWithGeneratedPublicId(insert, generate)).resolves.toBe(
      'second',
    )
    expect(insert).toHaveBeenCalledTimes(2)
  })

  it('does not retry unrelated database errors', async () => {
    const error = new Error('NOT NULL constraint failed: widgets.name')
    const insert = vi.fn().mockRejectedValue(error)

    await expect(insertWithGeneratedPublicId(insert)).rejects.toBe(error)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('fails after the bounded collision retry limit', async () => {
    const insert = vi
      .fn()
      .mockRejectedValue(
        new Error('UNIQUE constraint failed: widgets.public_id'),
      )

    await expect(insertWithGeneratedPublicId(insert)).rejects.toThrow(
      `after ${PUBLIC_ID_MAX_INSERT_ATTEMPTS} attempts`,
    )
    expect(insert).toHaveBeenCalledTimes(PUBLIC_ID_MAX_INSERT_ATTEMPTS)
  })
})
