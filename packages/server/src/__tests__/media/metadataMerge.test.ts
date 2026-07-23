import { describe, expect, it } from 'vitest'
import { mergeMetadata } from '../../media/metadataMerge.ts'

describe('mergeMetadata', () => {
  it('merges arrays while preserving provider precedence', () => {
    const merged = mergeMetadata(
      {
        genres: ['Drama'],
        images: { poster: [{ src: 'https://tmdb/poster.jpg' }] },
      },
      {
        genres: ['Biography'],
        images: { poster: [{ src: 'https://omdb/poster.jpg' }] },
      },
    )

    expect(merged.genres).toEqual(['Drama', 'Biography'])
    expect(merged.images.poster).toEqual([
      { src: 'https://tmdb/poster.jpg' },
      { src: 'https://omdb/poster.jpg' },
    ])
  })

  it('deduplicates arrays across repeated refreshes', () => {
    const metadata = {
      genres: ['Drama'],
      images: {
        poster: [
          {
            src: 'https://tmdb/poster.jpg',
            thumbnails: { medium: '/cached/poster.jpg' },
          },
        ],
      },
    }

    const merged = mergeMetadata(metadata, {
      genres: ['Drama'],
      images: { poster: [{ src: 'https://tmdb/poster.jpg' }] },
    })

    expect(merged.genres).toEqual(['Drama'])
    expect(merged.images.poster).toEqual(metadata.images.poster)
  })

  it('deduplicates equivalent objects regardless of property order', () => {
    const merged = mergeMetadata(
      { cast: [{ id: 1, name: 'Actor' }] },
      { cast: [{ name: 'Actor', id: 1 }] },
    )

    expect(merged.cast).toHaveLength(1)
  })

  it('can prioritize freshly refreshed arrays without discarding stored values', () => {
    const merged = mergeMetadata(
      { images: { poster: [{ src: 'https://omdb/old-small.jpg' }] } },
      { images: { poster: [{ src: 'https://tmdb/new-large.jpg' }] } },
      { incomingArraysFirst: true },
    )

    expect(merged.images.poster).toEqual([
      { src: 'https://tmdb/new-large.jpg' },
      { src: 'https://omdb/old-small.jpg' },
    ])
  })
})
