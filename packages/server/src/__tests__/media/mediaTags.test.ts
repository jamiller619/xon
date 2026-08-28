import {
  deriveMediaTags,
  genreNameFromTag,
  genreNamesFromTags,
  genreTag,
  isGenreTag,
  normalizeGenre,
  normalizeManualTags,
  replaceManualTags,
} from '@xon/shared'
import { describe, expect, it } from 'vitest'

describe('media tags', () => {
  it('normalizes genre names into namespaced Unicode tags', () => {
    expect(normalizeGenre('  Science Fiction  ')).toBe('science-fiction')
    expect(genreTag('Hip-Hop / Rap')).toBe('genre:hip-hop-rap')
    expect(genreTag('Électronique')).toBe('genre:électronique')
    expect(genreTag(' --- ')).toBeUndefined()
  })

  it('derives genres from every supported source in precedence order', () => {
    expect(
      deriveMediaTags({
        metadata: {
          genres: ['Science Fiction', 'Drama', null],
          genre: 'Comedy',
        },
        fileMetadata: {
          genres: ['drama', 'Ambient'],
          genre: 'Rock',
        },
        existingTags: ['favorite', 'Genre:stale', 42],
      }),
    ).toEqual([
      'favorite',
      'genre:science-fiction',
      'genre:drama',
      'genre:comedy',
      'genre:ambient',
      'genre:rock',
    ])
  })

  it('preserves manual values and order while replacing the genre namespace', () => {
    const result = deriveMediaTags({
      metadata: { genres: ['Mystery'] },
      existingTags: ['  Keep Spaces  ', 'genre:old', 'Pinned'],
    })

    expect(result).toEqual(['  Keep Spaces  ', 'Pinned', 'genre:mystery'])
    expect(
      deriveMediaTags({
        metadata: { genres: ['Mystery'] },
        existingTags: result,
      }),
    ).toEqual(result)
  })

  it('normalizes manual input and replaces only manual tags', () => {
    expect(
      normalizeManualTags([' Favorite ', 'favorite', '', 'genre:drama', null]),
    ).toEqual(['Favorite'])
    expect(
      replaceManualTags(['old', 'genre:science-fiction'], [' New ', 'new']),
    ).toEqual(['New', 'genre:science-fiction'])
  })

  it('parses and deduplicates genre tags for display', () => {
    expect(isGenreTag(' Genre:Science Fiction ')).toBe(true)
    expect(genreNameFromTag('genre:science-fiction')).toBe('Science Fiction')
    expect(genreNameFromTag('genre:')).toBeUndefined()
    expect(
      genreNamesFromTags([
        'genre:science-fiction',
        'GENRE:Science Fiction',
        'favorite',
        'genre:drama',
      ]),
    ).toEqual(['Science Fiction', 'Drama'])
  })
})
