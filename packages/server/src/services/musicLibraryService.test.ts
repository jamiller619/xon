import { describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '../db/schema.ts'
import * as libraryService from './libraryService.ts'
import {
  getMusicAlbumDetail,
  summarizeMusicItems,
} from './musicLibraryService.ts'

function musicItem(
  id: string,
  metadata: MediaItem['metadata'],
  createdAt = new Date('2026-01-01T00:00:00Z'),
  fileMetadata: MediaItem['fileMetadata'] = {},
): MediaItem {
  return {
    id,
    mediaType: 'audio/mpeg',
    metadata,
    createdAt,
    updatedAt: null,
    fileMetadata,
  } as MediaItem
}

describe('summarizeMusicItems', () => {
  it('groups albums and artists with song and album counts', () => {
    const summary = summarizeMusicItems([
      musicItem('one', { artist: 'Artist A', album: 'First' }),
      musicItem('two', { artist: 'Artist A', album: 'First' }),
      musicItem('three', { artist: 'Artist A', album: 'Second' }),
      musicItem('four', { artist: 'Artist B', album: 'First' }),
    ])

    expect(summary.albums).toHaveLength(3)
    expect(
      summary.albums.find(
        (album) => album.artist === 'Artist A' && album.title === 'First',
      )?.songCount,
    ).toBe(2)
    expect(summary.artists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Artist A',
          albumCount: 2,
          songCount: 3,
        }),
        expect.objectContaining({
          title: 'Artist B',
          albumCount: 1,
          songCount: 1,
        }),
      ]),
    )
  })

  it('uses fallback labels and prefers a track with artwork', () => {
    const summary = summarizeMusicItems([
      musicItem('without-art', {}),
      musicItem(
        'with-art',
        { images: { poster: ['album.jpg'] } },
        new Date('2026-02-01T00:00:00Z'),
      ),
    ])

    expect(summary.albums[0]).toMatchObject({
      title: 'Unknown Album',
      artist: 'Unknown Artist',
      songCount: 2,
      artwork: { id: 'with-art' },
      createdAt: new Date('2026-02-01T00:00:00Z'),
    })
    expect(summary.artists[0]).toMatchObject({
      title: 'Unknown Artist',
      albumCount: 1,
      songCount: 2,
      artwork: { id: 'with-art' },
    })
  })

  it('reads scanned tags from file metadata and keeps featured tracks in one album', () => {
    const summary = summarizeMusicItems([
      musicItem('one', {}, undefined, {
        album: 'Perception',
        artist: 'NF',
      }),
      musicItem('two', {}, undefined, {
        album: 'Perception',
        artist: 'NF, Ruelle',
      }),
      musicItem('three', {}, undefined, {
        album: 'PERCEPTION',
        artist: 'nf',
      }),
    ])

    expect(summary.albums).toEqual([
      expect.objectContaining({
        title: 'Perception',
        artist: 'NF',
        songCount: 3,
      }),
    ])
    expect(summary.artists).toHaveLength(2)
    expect(
      summary.artists.find((artist) => artist.title === 'NF')?.songCount,
    ).toBe(2)
  })

  it('does not turn playlist files into unknown albums or artists', () => {
    const playlist = musicItem('playlist', {})
    playlist.mediaType = 'audio/x-mpegurl'

    expect(summarizeMusicItems([playlist])).toEqual({
      albums: [],
      artists: [],
    })
  })

  it('returns only the selected album tracks in disc and track order', async () => {
    const selectedTracks = [
      musicItem('disc-two', { album: 'Album', artist: 'Artist' }, undefined, {
        discNumber: 2,
        trackNumber: 1,
      }),
      musicItem('track-two', { album: 'Album', artist: 'Artist' }, undefined, {
        discNumber: 1,
        trackNumber: 2,
      }),
      musicItem('track-one', { album: 'Album', artist: 'Artist' }, undefined, {
        discNumber: 1,
        trackNumber: 1,
      }),
    ]
    const items = [
      ...selectedTracks,
      musicItem('other-artist', { album: 'Album', artist: 'Other Artist' }),
    ]
    vi.spyOn(libraryService, 'getMediaByTypeAndLibraryId').mockResolvedValue(
      items,
    )
    const albumId = summarizeMusicItems(selectedTracks).albums[0]?.id

    const detail = await getMusicAlbumDetail(
      {} as Parameters<typeof getMusicAlbumDetail>[0],
      'library-1',
      albumId ?? '',
    )

    expect(detail?.tracks.map((track) => track.id)).toEqual([
      'track-one',
      'track-two',
      'disc-two',
    ])
    expect(detail).toMatchObject({
      title: 'Album',
      artist: 'Artist',
      songCount: 3,
    })
  })
})
