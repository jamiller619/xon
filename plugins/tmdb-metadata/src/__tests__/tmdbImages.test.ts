import type { PluginContext } from '@xon/plugin-sdk'
import { LibraryType, MediaType } from '@xon/shared'
import { describe, expect, it, vi } from 'vitest'
import TmdbMetadataPlugin from '../index.js'
import { TmdbClient } from '../tmdbClient.js'

function makeFetch(responses: unknown[]) {
  let index = 0
  return vi.fn(async () => {
    const json = responses[index++]
    return {
      ok: json !== undefined,
      json: async () => json,
    } as Response
  })
}

function image(
  file_path: string,
  iso_639_1: string | null,
  vote_average: number,
) {
  return {
    aspect_ratio: 1,
    file_path,
    height: 1000,
    iso_639_1,
    vote_average,
    vote_count: 10,
    width: 1000,
  }
}

describe('TMDb artwork metadata', () => {
  it('keeps three posters on initial scans without restricting other artwork', async () => {
    const details = {
      id: 603,
      imdb_id: 'tt0133093',
      title: 'The Matrix',
      original_title: 'The Matrix',
      overview: 'Hacker movie.',
      poster_path: '/fallback-poster.jpg',
      backdrop_path: '/fallback-backdrop.jpg',
      release_date: '1999-03-31',
      vote_average: 8.7,
      genres: [],
      credits: { cast: [], crew: [] },
    }
    const images = {
      backdrops: [
        image('/backdrop-1.jpg', null, 1),
        image('/backdrop-2.jpg', null, 2),
        image('/backdrop-3.jpg', null, 3),
        image('/backdrop-4.jpg', null, 4),
      ],
      posters: [
        image('/poster-en.jpg', 'en', 1),
        image('/poster-neutral-low.jpg', null, 2),
        image('/poster-neutral-high.jpg', null, 3),
        image('/poster-fr.jpg', 'fr', 4),
      ],
      logos: [
        image('/logo-en.png', 'en', 1),
        image('/logo-neutral-low.png', null, 2),
        image('/logo-neutral-high.png', null, 3),
        image('/logo-fr.png', 'fr', 4),
      ],
    }
    const client = new TmdbClient('key', makeFetch([details, images]))

    const result = await client.fetchMovieMetadataById(603, 'en')

    expect(result?.images.backdrop).toHaveLength(4)
    expect(result?.images.poster).toEqual([
      { src: expect.stringContaining('/poster-en.jpg') },
      { src: expect.stringContaining('/poster-neutral-high.jpg') },
      { src: expect.stringContaining('/poster-neutral-low.jpg') },
    ])
    expect(result?.images.logo).toEqual([
      expect.stringContaining('/logo-en.png'),
      expect.stringContaining('/logo-neutral-high.png'),
      expect.stringContaining('/logo-neutral-low.png'),
      expect.stringContaining('/logo-fr.png'),
    ])
  })

  it('saves every returned image while preserving poster entries', async () => {
    const details = {
      id: 603,
      imdb_id: 'tt0133093',
      title: 'The Matrix',
      original_title: 'The Matrix',
      overview: 'Hacker movie.',
      poster_path: '/fallback-poster.jpg',
      backdrop_path: '/fallback-backdrop.jpg',
      release_date: '1999-03-31',
      vote_average: 8.7,
      genres: [],
      credits: { cast: [], crew: [] },
    }
    const images = {
      backdrops: [
        image('/backdrop-1.jpg', null, 1),
        image('/backdrop-2.jpg', null, 2),
        image('/backdrop-3.jpg', null, 3),
        image('/backdrop-4.jpg', null, 4),
      ],
      posters: [
        image('/poster-en.jpg', 'en', 1),
        image('/poster-neutral-low.jpg', null, 2),
        image('/poster-neutral-high.jpg', null, 3),
        image('/poster-fr.jpg', 'fr', 4),
      ],
      logos: [
        image('/logo-en.png', 'en', 1),
        image('/logo-neutral-low.png', null, 2),
        image('/logo-neutral-high.png', null, 3),
        image('/logo-fr.png', 'fr', 4),
      ],
    }
    const save = vi.fn(async (url: string) => {
      const filename = new URL(url).pathname.split('/').at(-1)
      return `/saved/${filename}`
    })
    const settings = {
      get: vi.fn((key: string) => {
        if (key === 'apiKey') return 'key'
        if (key === 'language') return 'en'
        if (key === 'saveImages') return true
        if (key === 'imageLimit') return 0
      }),
      getAll: vi.fn(() => ({})),
    }
    const context = {
      settings,
      images: { save },
      fetch: makeFetch([{ results: [{ id: 603 }] }, details, images]),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as unknown as PluginContext
    const plugin = new TmdbMetadataPlugin()
    await plugin.init(context)

    const result = await plugin.enrich('The Matrix.mkv', LibraryType.Movies, {
      title: 'The Matrix',
    })

    expect(save).toHaveBeenCalledTimes(11)
    expect(result?.images.poster).toEqual([
      { src: '/saved/poster-en.jpg' },
      { src: '/saved/poster-neutral-high.jpg' },
      { src: '/saved/poster-neutral-low.jpg' },
    ])
    expect(result?.images.backdrop).toEqual([
      '/saved/backdrop-1.jpg',
      '/saved/backdrop-2.jpg',
      '/saved/backdrop-3.jpg',
      '/saved/backdrop-4.jpg',
    ])
    expect(result?.images.logo).toEqual([
      '/saved/logo-en.png',
      '/saved/logo-neutral-high.png',
      '/saved/logo-neutral-low.png',
      '/saved/logo-fr.png',
    ])
  })

  it('finds and saves every poster for an existing match', async () => {
    const images = {
      backdrops: [],
      posters: [
        image('/poster-en.jpg', 'en', 1),
        image('/poster-neutral-low.jpg', null, 2),
        image('/poster-neutral-high.jpg', null, 3),
        image('/poster-fr.jpg', 'fr', 4),
      ],
      logos: [],
    }
    const save = vi.fn(async (url: string) => {
      const filename = new URL(url).pathname.split('/').at(-1)
      return `/saved/${filename}`
    })
    const fetch = makeFetch([images])
    const context = {
      settings: {
        get: vi.fn((key: string) => {
          if (key === 'apiKey') return 'key'
          if (key === 'language') return 'en'
          if (key === 'saveImages') return true
          if (key === 'imageLimit') return 0
        }),
        getAll: vi.fn(() => ({})),
      },
      images: { save },
      fetch,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as unknown as PluginContext
    const plugin = new TmdbMetadataPlugin()
    await plugin.init(context)

    const posters = await plugin.findPosters('603', {
      title: 'The Matrix',
      libraryType: LibraryType.Movies,
      mediaType: MediaType.MainType.Video,
      limit: 10,
    })

    expect(save).toHaveBeenCalledTimes(4)
    expect(fetch).toHaveBeenCalledWith(
      expect.not.stringContaining('include_image_language'),
    )
    expect(posters).toEqual([
      { src: '/saved/poster-en.jpg' },
      { src: '/saved/poster-neutral-high.jpg' },
      { src: '/saved/poster-neutral-low.jpg' },
      { src: '/saved/poster-fr.jpg' },
    ])
  })
})
