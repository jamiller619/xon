import { describe, expect, it } from 'vitest'
import { makeMediaRouter } from '../../../routes/media.ts'

describe('media route composition', () => {
  it('mounts every media endpoint exactly once', () => {
    const router = makeMediaRouter({} as never)
    const routes = [
      ...new Set(
        router.routes
          .filter((route) => route.method !== 'ALL')
          .map((route) => `${route.method} ${route.path}`),
      ),
    ].sort()

    expect(routes).toEqual(
      [
        'GET /',
        'GET /:id',
        'GET /:id/hls/:segment',
        'GET /:id/hls/playlist.m3u8',
        'GET /:id/images/:kind/:index',
        'GET /:id/match-providers',
        'GET /:id/matches',
        'GET /:id/related',
        'GET /:id/stream',
        'GET /:id/subtitle',
        'GET /:id/thumbnail',
        'GET /:id/tracks',
        'GET /featured',
        'POST /:id/images/:kind',
        'POST /:id/images/backdrops/generate',
        'POST /:id/images/posters/find',
        'POST /:id/images/posters/generate',
        'POST /:id/match',
        'POST /bulk',
        'PUT /:id',
        'PUT /:id/images',
        'PUT /:id/play-state',
      ].sort(),
    )
  })
})
