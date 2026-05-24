import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryCache, computeETag } from '../cache.ts'

describe('InMemoryCache', () => {
  let cache: InMemoryCache

  beforeEach(() => {
    cache = new InMemoryCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and retrieves a value within TTL', () => {
    cache.set('k', 'hello', 1000)
    expect(cache.get('k')).toBe('hello')
  })

  it('returns undefined for unknown key', () => {
    expect(cache.get('missing')).toBeUndefined()
  })

  it('returns undefined and evicts entry after TTL expires', () => {
    cache.set('k', 42, 1000)
    vi.advanceTimersByTime(1001)
    expect(cache.get('k')).toBeUndefined()
    expect(cache.size()).toBe(0)
  })

  it('does not expire entry before TTL', () => {
    cache.set('k', 42, 1000)
    vi.advanceTimersByTime(999)
    expect(cache.get<number>('k')).toBe(42)
  })

  it('invalidate removes specific key', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.invalidate('a')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
  })

  it('invalidatePrefix removes all matching keys', () => {
    cache.set('media:count:lib1', 10)
    cache.set('media:count:lib2', 20)
    cache.set('libraries:all', [])
    cache.invalidatePrefix('media:count:')
    expect(cache.get('media:count:lib1')).toBeUndefined()
    expect(cache.get('media:count:lib2')).toBeUndefined()
    expect(cache.get('libraries:all')).toBeDefined()
  })

  it('clear removes all entries', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size()).toBe(0)
  })

  it('overwrites an existing key with set', () => {
    cache.set('k', 'old', 5000)
    cache.set('k', 'new', 5000)
    expect(cache.get('k')).toBe('new')
  })
})

describe('computeETag', () => {
  it('returns a quoted hex string', () => {
    const tag = computeETag({ id: 1 })
    expect(tag).toMatch(/^"[0-9a-f]{16}"$/)
  })

  it('is deterministic for the same input', () => {
    expect(computeETag([1, 2, 3])).toBe(computeETag([1, 2, 3]))
  })

  it('differs for different input', () => {
    expect(computeETag({ a: 1 })).not.toBe(computeETag({ a: 2 }))
  })
})
