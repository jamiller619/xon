import { LibraryType } from '@xon/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registry } from '../../plugins/pluginManager.ts'
import type { MediaJob, PipelineContext } from '../../scanner/pipeline.ts'
import libraryMetadata from '../../scanner/stages/libraryMetadata.ts'

function pluginEntry(
  id: string,
  instance: {
    resolveMatch: ReturnType<typeof vi.fn>
    enrich: ReturnType<typeof vi.fn>
  },
  priority: number,
) {
  return {
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      description: '',
      author: '',
      category: 'MetadataSource',
      priority,
      libraryTypes: [LibraryType.Movies],
    },
    pluginDir: '',
    instance,
    status: 'active',
    hooks: [],
    routes: [],
    uiComponents: [],
    metadataProviders: [],
  } as never
}

afterEach(() => {
  registry.clear()
})

describe('metadata refresh matching', () => {
  it('resolves the stored match before enriching with other providers', async () => {
    const selected = {
      resolveMatch: vi.fn().mockResolvedValue({
        tmdbId: 603,
        imdbId: 'tt0133093',
        title: 'The Matrix',
        overview: 'Exact metadata',
      }),
      enrich: vi.fn(),
    }
    const secondary = {
      resolveMatch: vi.fn(),
      enrich: vi.fn().mockResolvedValue({
        imdbId: 'tt9999999',
        genres: ['Science Fiction'],
      }),
    }
    registry.set('omdb-metadata', pluginEntry('omdb-metadata', secondary, 0))
    registry.set('tmdb-metadata', pluginEntry('tmdb-metadata', selected, 10))

    const now = new Date()
    const job: MediaJob = {
      id: 'job-1',
      type: 'refresh',
      file: {
        id: '/movies/The Matrix.mkv',
        path: '/movies/The Matrix.mkv',
        name: 'The Matrix.mkv',
        size: 100,
        createdAt: now,
        modifiedAt: now,
        ext: '.mkv',
        mediaType: 'video/x-matroska',
      },
      libraryId: 'library-1',
      libraryType: LibraryType.Movies,
      mediaTypes: [],
      dataSourcePath: '/movies',
      data: {
        id: 'media-1',
        title: 'The Matrix',
        fileMetadata: { year: 1999 },
        metadata: { tmdbId: 603 },
        matchId: '603',
        matchIdSource: 'tmdb-metadata',
      },
      errors: [],
    }
    const ctx = {
      logger: { log: vi.fn(), error: vi.fn() },
    } as unknown as PipelineContext

    const result = await libraryMetadata.run(ctx, job)

    expect(selected.resolveMatch).toHaveBeenCalledWith('603', {
      title: 'The Matrix',
      year: 1999,
      libraryType: LibraryType.Movies,
      mediaType: 'video',
      limit: 10,
      fileMetadata: { year: 1999 },
    })
    expect(selected.enrich).not.toHaveBeenCalled()
    expect(secondary.enrich).toHaveBeenCalledWith(
      'The Matrix.mkv',
      LibraryType.Movies,
      expect.objectContaining({
        metadata: expect.objectContaining({
          tmdbId: 603,
          imdbId: 'tt0133093',
        }),
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        matchId: '603',
        matchIdSource: 'tmdb-metadata',
        title: 'The Matrix',
        metadata: expect.objectContaining({
          overview: 'Exact metadata',
          genres: ['Science Fiction'],
        }),
      }),
    )
  })

  it('supports legacy match source names', async () => {
    const selected = {
      resolveMatch: vi.fn().mockResolvedValue({ tmdbId: 603 }),
      enrich: vi.fn(),
    }
    registry.set('tmdb-metadata', pluginEntry('tmdb-metadata', selected, 0))

    const now = new Date()
    const job = {
      id: 'job-1',
      type: 'refresh',
      file: {
        id: '/movies/movie.mkv',
        path: '/movies/movie.mkv',
        name: 'movie.mkv',
        size: 100,
        createdAt: now,
        modifiedAt: now,
        ext: '.mkv',
        mediaType: 'video/x-matroska',
      },
      libraryId: 'library-1',
      libraryType: LibraryType.Movies,
      mediaTypes: [],
      dataSourcePath: '/movies',
      data: {
        id: 'media-1',
        title: 'The Matrix',
        metadata: {},
        matchId: '603',
        matchIdSource: 'tmdb',
      },
      errors: [],
    } satisfies MediaJob

    await libraryMetadata.run(
      {
        logger: { log: vi.fn(), error: vi.fn() },
      } as unknown as PipelineContext,
      job,
    )

    expect(selected.resolveMatch).toHaveBeenCalledWith(
      '603',
      expect.any(Object),
    )
    expect(selected.enrich).not.toHaveBeenCalled()
  })

  it('infers the provider when a stored match has no source', async () => {
    const selected = {
      resolveMatch: vi.fn().mockResolvedValue({ tmdbId: 603 }),
      enrich: vi.fn(),
    }
    registry.set('tmdb-metadata', pluginEntry('tmdb-metadata', selected, 0))

    const now = new Date()
    const job = {
      id: 'job-1',
      type: 'refresh',
      file: {
        id: '/movies/movie.mkv',
        path: '/movies/movie.mkv',
        name: 'movie.mkv',
        size: 100,
        createdAt: now,
        modifiedAt: now,
        ext: '.mkv',
        mediaType: 'video/x-matroska',
      },
      libraryId: 'library-1',
      libraryType: LibraryType.Movies,
      mediaTypes: [],
      dataSourcePath: '/movies',
      data: {
        id: 'media-1',
        title: 'The Matrix',
        metadata: {},
        matchId: '603',
      },
      errors: [],
    } satisfies MediaJob

    const result = await libraryMetadata.run(
      {
        logger: { log: vi.fn(), error: vi.fn() },
      } as unknown as PipelineContext,
      job,
    )

    expect(selected.resolveMatch).toHaveBeenCalledWith(
      '603',
      expect.any(Object),
    )
    expect(result?.matchIdSource).toBe('tmdb-metadata')
  })
})
