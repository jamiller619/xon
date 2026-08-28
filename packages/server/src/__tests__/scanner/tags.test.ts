import { describe, expect, it } from 'vitest'
import type { MediaJob, PipelineContext } from '../../scanner/pipeline.ts'
import tags from '../../scanner/stages/tags.ts'

describe('tags scanner stage', () => {
  it('combines enriched and embedded genres while preserving manual tags', async () => {
    const result = await tags.run(
      {} as PipelineContext,
      {
        data: {
          publicId: 'media-1',
          metadata: { genres: ['Science Fiction'], genre: 'Drama' },
          fileMetadata: { genres: ['Ambient'], genre: 'Rock' },
          tags: ['favorite', 'genre:stale'],
        },
      } as MediaJob,
    )

    expect(result).toEqual({
      tags: [
        'favorite',
        'genre:science-fiction',
        'genre:drama',
        'genre:ambient',
        'genre:rock',
      ],
    })
  })
})
