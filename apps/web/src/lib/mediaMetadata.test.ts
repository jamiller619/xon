import type { MediaItem } from '@xon/shared'
import { describe, expect, it } from 'vitest'
import {
  formatMetadata,
  mediaGenres,
  mediaMetadataText,
  metadataValue,
} from './mediaMetadata'

const BASE_ITEM: MediaItem = {
  id: 'media-1',
  libraryId: 'library-1',
  dataSourceId: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: null,
  filePath: '/media/movie.mkv',
  fileSize: 1,
  fileMetadata: {},
  mediaType: 'video/x-matroska',
  matchId: null,
  matchIdSource: null,
  title: 'Movie',
  description: null,
  metadata: {},
  drmProtected: false,
  scannedAt: new Date('2024-01-01T00:00:00Z'),
  tags: [],
}

describe('media metadata formatting', () => {
  it('returns requested values in order with the shared bullet separator', () => {
    const item = withMetadata({
      releaseDate: '2024-06-14',
      genres: ['Drama', 'Comedy', 'Mystery'],
    })

    expect(formatMetadata(item, ['year', 'type'])).toBe('2024 · Drama / Comedy')
  })

  it('falls back to the normalized media type when genres are absent', () => {
    expect(formatMetadata(BASE_ITEM, ['type'])).toBe('Video')
  })

  it('normalizes legacy singular genres in one place', () => {
    expect(mediaGenres(withMetadata({ genre: 'Documentary' }))).toEqual([
      'Documentary',
    ])
  })

  it('prefers canonical genre tags and formats them for display', () => {
    expect(
      mediaGenres({
        ...withMetadata({ genres: ['Metadata Should Not Win'] }),
        tags: [
          'favorite',
          'genre:science-fiction',
          'Genre:Science Fiction',
          'genre:drama',
        ],
      }),
    ).toEqual(['Science Fiction', 'Drama'])
  })

  it('falls back to metadata when genre tags are malformed', () => {
    expect(
      mediaGenres({
        ...withMetadata({ genres: ['Comedy'] }),
        tags: ['genre:', 'favorite'],
      }),
    ).toEqual(['Comedy'])
  })

  it('prefers an explicit metadata year over the release date', () => {
    const item = withMetadata({ year: 1999, releaseDate: '2000-01-01' })

    expect(metadataValue(item, 'year')).toBe('1999')
  })

  it('omits missing values and supports a caller-provided separator', () => {
    expect(
      formatMetadata(BASE_ITEM, ['year', 'type'], { separator: ' / ' }),
    ).toBe('Video')
  })

  it('reads trimmed text from embedded file metadata', () => {
    const item = { ...BASE_ITEM, fileMetadata: { artist: '  NF  ' } }

    expect(mediaMetadataText(item, 'artist')).toBe('NF')
  })

  it('falls back to library metadata when the embedded value is blank', () => {
    const item = {
      ...withMetadata({ album: 'Therapy Session' }),
      fileMetadata: { album: '   ' },
    }

    expect(mediaMetadataText(item, 'album')).toBe('Therapy Session')
  })
})

function withMetadata(metadata: MediaItem['metadata']): MediaItem {
  return { ...BASE_ITEM, metadata }
}
