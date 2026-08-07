import type { Client } from '@libsql/client'
import { MediaCategory } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../db/db.ts'
import { migrateDatabase } from '../../db/migrate.ts'
import {
  collectionItems,
  collections,
  dataSources,
  libraries,
  mediaItems,
} from '../../db/schema.ts'
import {
  clusterCoordinate,
  createAudiobookCollections,
  createMusicCollections,
  createPhotoCollections,
  createTvCollections,
  parseExifDate,
  parseExifTimestamp,
  parseTvEpisode,
  resolveAudiobookInfo,
  resolveSeriesName,
} from '../../media/collections.ts'

describe('parseTvEpisode', () => {
  it('parses standard SxxExx with series name', () => {
    const result = parseTvEpisode(
      "Breaking Bad S01E03 - ...and the Bag's in the River.mkv",
    )
    expect(result).not.toBeNull()
    expect(result?.season).toBe(1)
    expect(result?.episode).toBe(3)
    expect(result?.seriesName).toBe('Breaking Bad')
  })

  it('parses SxxExx with dots as separators', () => {
    const result = parseTvEpisode('The.Wire.S03E12.mkv')
    expect(result).not.toBeNull()
    expect(result?.season).toBe(3)
    expect(result?.episode).toBe(12)
    expect(result?.seriesName).toBe('The Wire')
  })

  it('parses lowercase sXXeXX', () => {
    const result = parseTvEpisode('lost.s02e23.mkv')
    expect(result).not.toBeNull()
    expect(result?.season).toBe(2)
    expect(result?.episode).toBe(23)
  })

  it('parses NxNN format', () => {
    const result = parseTvEpisode('Firefly 1x11.mkv')
    expect(result).not.toBeNull()
    expect(result?.season).toBe(1)
    expect(result?.episode).toBe(11)
    expect(result?.seriesName).toBe('Firefly')
  })

  it('parses two-digit season and episode', () => {
    const result = parseTvEpisode('S10E05.mkv')
    expect(result).not.toBeNull()
    expect(result?.season).toBe(10)
    expect(result?.episode).toBe(5)
    expect(result?.seriesName).toBeNull()
  })

  it('returns null for non-TV filename', () => {
    expect(parseTvEpisode('Inception.2010.mkv')).toBeNull()
    expect(parseTvEpisode('song.mp3')).toBeNull()
    expect(parseTvEpisode('document.pdf')).toBeNull()
  })
})

describe('resolveSeriesName', () => {
  it('uses series name from episode info when available', () => {
    const info = { seriesName: 'Breaking Bad', season: 1, episode: 3 }
    expect(resolveSeriesName('/media/Breaking Bad/S01E03.mkv', info)).toBe(
      'Breaking Bad',
    )
  })

  it('uses grandparent dir when parent looks like Season folder', () => {
    const info = { seriesName: null, season: 1, episode: 3 }
    expect(resolveSeriesName('/media/The Wire/Season 1/ep.mkv', info)).toBe(
      'The Wire',
    )
    expect(resolveSeriesName('/media/Sopranos/season01/ep.mkv', info)).toBe(
      'Sopranos',
    )
    expect(resolveSeriesName('/media/Lost/S02/ep.mkv', info)).toBe('Lost')
  })

  it('uses parent dir when it does not look like Season folder', () => {
    const info = { seriesName: null, season: 1, episode: 3 }
    expect(resolveSeriesName('/media/Breaking Bad/S01E03.mkv', info)).toBe(
      'Breaking Bad',
    )
  })
})

describe('createTvCollections', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)

    await db
      .insert(libraries)
      .values({ id: 'lib-1', name: 'TV Shows', mediaTypes: '[]' })
    await db.insert(dataSources).values({
      id: 'ds-1',
      libraryId: 'lib-1',
      type: 'local',
      path: '/tv',
    })
  })

  afterEach(() => {
    client.close()
  })

  it('creates series and season collections for TV episodes', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'ep-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/tv/Breaking Bad S01E01.mkv',
        fileName: 'Breaking Bad S01E01.mkv',
        fileSize: 5000,
        metadata: '{}',
      },
      {
        id: 'ep-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/tv/Breaking Bad S01E02.mkv',
        fileName: 'Breaking Bad S01E02.mkv',
        fileSize: 5000,
        metadata: '{}',
      },
      {
        id: 'ep-3',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/tv/Breaking Bad S02E01.mkv',
        fileName: 'Breaking Bad S02E01.mkv',
        fileSize: 5000,
        metadata: '{}',
      },
    ])

    await createTvCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections).where()
    const seriesCollections = allCollections.filter((g) => g.type === 'series')
    const seasonCollections = allCollections.filter((g) => g.type === 'season')

    expect(seriesCollections).toHaveLength(1)
    expect(seriesCollections[0]?.title).toBe('Breaking Bad')

    expect(seasonCollections).toHaveLength(2)
    const seasonTitles = seasonCollections.map((g) => g.title).sort()
    expect(seasonTitles).toEqual(['Season 1', 'Season 2'])
  })

  it('assigns episodes to season collections with correct sort order', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'ep-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/tv/Lost S01E01.mkv',
        fileName: 'Lost S01E01.mkv',
        fileSize: 5000,
        metadata: '{}',
      },
      {
        id: 'ep-5',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/tv/Lost S01E05.mkv',
        fileName: 'Lost S01E05.mkv',
        fileSize: 5000,
        metadata: '{}',
      },
    ])

    await createTvCollections(db, 'lib-1')

    const members = await db.select().from(collectionItems)
    expect(members).toHaveLength(2)

    const ep1 = members.find((m) => m.mediaItemId === 'ep-1')
    const ep5 = members.find((m) => m.mediaItemId === 'ep-5')
    expect(ep1?.sortOrder).toBe(1)
    expect(ep5?.sortOrder).toBe(5)
  })

  it('does not duplicate collections or members on repeated calls', async () => {
    await db.insert(mediaItems).values({
      id: 'ep-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/tv/The Wire S01E01.mkv',
      fileName: 'The Wire S01E01.mkv',
      fileSize: 5000,
      metadata: '{}',
    })

    await createTvCollections(db, 'lib-1')
    await createTvCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const members = await db.select().from(collectionItems)

    // Should still have exactly 1 series + 1 season = 2 collections
    expect(allCollections).toHaveLength(2)
    expect(members).toHaveLength(1)
  })

  it('ignores files without TV episode patterns', async () => {
    await db.insert(mediaItems).values({
      id: 'movie-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/tv/Inception.2010.mkv',
      fileName: 'Inception.2010.mkv',
      fileSize: 8000,
      metadata: '{}',
    })

    await createTvCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    expect(allCollections).toHaveLength(0)
  })

  it('creates separate series for different shows', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'ep-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/tv/Breaking Bad S01E01.mkv',
        fileName: 'Breaking Bad S01E01.mkv',
        fileSize: 5000,
        metadata: '{}',
      },
      {
        id: 'ep-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/tv/Lost S01E01.mkv',
        fileName: 'Lost S01E01.mkv',
        fileSize: 5000,
        metadata: '{}',
      },
    ])

    await createTvCollections(db, 'lib-1')

    const seriesCollections = await db.select().from(collections)
    const series = seriesCollections.filter((g) => g.type === 'series')
    expect(series).toHaveLength(2)
    const titles = series.map((g) => g.title).sort()
    expect(titles).toEqual(['Breaking Bad', 'Lost'])
  })

  it('uses folder hierarchy when episode has no inline series name', async () => {
    await db.insert(mediaItems).values({
      id: 'ep-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/tv/Sopranos/Season 1/S01E01.mkv',
      fileName: 'S01E01.mkv',
      fileSize: 5000,
      metadata: '{}',
    })

    await createTvCollections(db, 'lib-1')

    const seriesCollections = await db.select().from(collections)
    const series = seriesCollections.filter((g) => g.type === 'series')
    expect(series).toHaveLength(1)
    expect(series[0]?.title).toBe('Sopranos')
  })
})

describe('createMusicCollections', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)

    await db
      .insert(libraries)
      .values({ id: 'lib-1', name: 'Music', mediaTypes: '[]' })
    await db.insert(dataSources).values({
      id: 'ds-1',
      libraryId: 'lib-1',
      type: 'local',
      path: '/music',
    })
  })

  afterEach(() => {
    client.close()
  })

  it('creates artist and album collections for music tracks', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'track-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/01 - Song One.mp3',
        fileName: '01 - Song One.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist A',
          album: 'Album X',
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: 'track-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/02 - Song Two.mp3',
        fileName: '02 - Song Two.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist A',
          album: 'Album X',
          trackNumber: 2,
          discNumber: 1,
        }),
      },
    ])

    await createMusicCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const artistCollections = allCollections.filter((g) => g.type === 'artist')
    const albumCollections = allCollections.filter((g) => g.type === 'album')

    expect(artistCollections).toHaveLength(1)
    expect(artistCollections[0]?.title).toBe('Artist A')

    expect(albumCollections).toHaveLength(1)
    expect(albumCollections[0]?.title).toBe('Album X')
    expect(albumCollections[0]?.parentCollectionId).toBe(
      artistCollections[0]?.id,
    )
  })

  it('assigns tracks to album collections with disc*1000+track sort order', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'track-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/d1t1.mp3',
        fileName: 'd1t1.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist A',
          album: 'Double Album',
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: 'track-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/d2t1.mp3',
        fileName: 'd2t1.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist A',
          album: 'Double Album',
          trackNumber: 1,
          discNumber: 2,
        }),
      },
    ])

    await createMusicCollections(db, 'lib-1')

    const members = await db.select().from(collectionItems)
    expect(members).toHaveLength(2)

    const m1 = members.find((m) => m.mediaItemId === 'track-1')
    const m2 = members.find((m) => m.mediaItemId === 'track-2')
    expect(m1?.sortOrder).toBe(1 * 1000 + 1) // disc 1 track 1 = 1001
    expect(m2?.sortOrder).toBe(2 * 1000 + 1) // disc 2 track 1 = 2001
  })

  it('collections compilation albums under Various Artists', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'track-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/comp1.mp3',
        fileName: 'comp1.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist A',
          album: 'Best Of 2024',
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: 'track-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/comp2.mp3',
        fileName: 'comp2.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist B',
          album: 'Best Of 2024',
          trackNumber: 2,
          discNumber: 1,
        }),
      },
    ])

    await createMusicCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const artistCollections = allCollections.filter((g) => g.type === 'artist')
    const albumCollections = allCollections.filter((g) => g.type === 'album')

    expect(artistCollections).toHaveLength(1)
    expect(artistCollections[0]?.title).toBe('Various Artists')
    expect(albumCollections).toHaveLength(1)
    expect(albumCollections[0]?.title).toBe('Best Of 2024')
  })

  it('does not duplicate collections or members on repeated calls', async () => {
    await db.insert(mediaItems).values({
      id: 'track-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/music/song.mp3',
      fileName: 'song.mp3',
      fileSize: 3000,
      mediaCategory: MediaCategory.Music,
      metadata: JSON.stringify({
        artist: 'Artist A',
        album: 'Album X',
        trackNumber: 1,
        discNumber: 1,
      }),
    })

    await createMusicCollections(db, 'lib-1')
    await createMusicCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const members = await db.select().from(collectionItems)

    // 1 artist collection + 1 album collection = 2 total
    expect(allCollections).toHaveLength(2)
    expect(members).toHaveLength(1)
  })

  it('ignores tracks without album metadata', async () => {
    await db.insert(mediaItems).values({
      id: 'track-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/music/unknown.mp3',
      fileName: 'unknown.mp3',
      fileSize: 3000,
      mediaCategory: MediaCategory.Music,
      metadata: JSON.stringify({ artist: 'Artist A', trackNumber: 1 }),
    })

    await createMusicCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    expect(allCollections).toHaveLength(0)
  })

  it('creates separate album collections for different artists with the same album name', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'track-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/a/greatest.mp3',
        fileName: 'greatest.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist A',
          album: 'Greatest Hits',
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: 'track-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/b/greatest.mp3',
        fileName: 'greatest.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist B',
          album: 'Greatest Hits',
          trackNumber: 1,
          discNumber: 1,
        }),
      },
    ])

    await createMusicCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const artistCollections = allCollections.filter((g) => g.type === 'artist')
    const albumCollections = allCollections.filter((g) => g.type === 'album')

    // "Greatest Hits" by two different artists = compilation → 1 "Various Artists" + 1 album
    expect(artistCollections).toHaveLength(1)
    expect(artistCollections[0]?.title).toBe('Various Artists')
    expect(albumCollections).toHaveLength(1)
  })

  it('only processes Music category items, not other categories', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'track-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/song.mp3',
        fileName: 'song.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: 'Artist A',
          album: 'Album X',
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: 'audiobook-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/music/chapter1.m4b',
        fileName: 'chapter1.m4b',
        fileSize: 10000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({
          artist: 'Author',
          album: 'Big Book',
          trackNumber: 1,
          discNumber: 1,
        }),
      },
    ])

    await createMusicCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const members = await db.select().from(collectionItems)

    // Only the Music track should be organized
    expect(allCollections).toHaveLength(2) // 1 artist + 1 album
    expect(members).toHaveLength(1)
    expect(members[0]?.mediaItemId).toBe('track-1')
  })
})

describe('resolveAudiobookInfo', () => {
  it('uses album tag as book title', () => {
    const result = resolveAudiobookInfo('/audiobooks/chapter01.m4b', {
      album: 'Dune',
    })
    expect(result.bookTitle).toBe('Dune')
  })

  it('falls back to parent folder when no album tag', () => {
    const result = resolveAudiobookInfo('/audiobooks/Dune/chapter01.m4b', {})
    expect(result.bookTitle).toBe('Dune')
  })

  it('uses series tag for series name', () => {
    const result = resolveAudiobookInfo('/audiobooks/chapter01.m4b', {
      album: 'Dune',
      series: 'Dune Chronicles',
    })
    expect(result.bookTitle).toBe('Dune')
    expect(result.seriesName).toBe('Dune Chronicles')
  })

  it('uses parent folder as series when album tag differs from parent folder', () => {
    const result = resolveAudiobookInfo(
      '/audiobooks/Dune Chronicles/chapter01.m4b',
      {
        album: 'Dune',
      },
    )
    expect(result.bookTitle).toBe('Dune')
    expect(result.seriesName).toBe('Dune Chronicles')
  })

  it('uses grandparent folder as series when no album tag', () => {
    const result = resolveAudiobookInfo(
      '/audiobooks/Dune Chronicles/Dune/chapter01.m4b',
      {},
    )
    expect(result.bookTitle).toBe('Dune')
    expect(result.seriesName).toBe('Dune Chronicles')
  })

  it('returns null series when album tag matches parent folder (standalone book)', () => {
    const result = resolveAudiobookInfo('/audiobooks/Dune/chapter01.m4b', {
      album: 'Dune',
    })
    expect(result.bookTitle).toBe('Dune')
    expect(result.seriesName).toBeNull()
  })
})

describe('createAudiobookCollections', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)

    await db
      .insert(libraries)
      .values({ id: 'lib-1', name: 'Audiobooks', mediaTypes: '[]' })
    await db.insert(dataSources).values({
      id: 'ds-1',
      libraryId: 'lib-1',
      type: 'local',
      path: '/audiobooks',
    })
  })

  afterEach(() => {
    client.close()
  })

  it('creates book collections for audiobook chapters', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'ch-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/Dune/ch01.m4b',
        fileName: 'ch01.m4b',
        fileSize: 10000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({
          album: 'Dune',
          artist: 'Simon Vance',
          trackNumber: 1,
        }),
      },
      {
        id: 'ch-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/Dune/ch02.m4b',
        fileName: 'ch02.m4b',
        fileSize: 10000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({
          album: 'Dune',
          artist: 'Simon Vance',
          trackNumber: 2,
        }),
      },
    ])

    await createAudiobookCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const bookCollections = allCollections.filter((g) => g.type === 'book')

    expect(bookCollections).toHaveLength(1)
    expect(bookCollections[0]?.title).toBe('Dune')
  })

  it('stores narrator in book collection metadata', async () => {
    await db.insert(mediaItems).values({
      id: 'ch-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/audiobooks/Dune/ch01.m4b',
      fileName: 'ch01.m4b',
      fileSize: 10000,
      mediaCategory: MediaCategory.Audiobooks,
      metadata: JSON.stringify({
        album: 'Dune',
        artist: 'Simon Vance',
        trackNumber: 1,
      }),
    })

    await createAudiobookCollections(db, 'lib-1')

    const bookCollections = await db.select().from(collections).where()
    expect(bookCollections).toHaveLength(1)
    const meta = JSON.parse(bookCollections[0]?.metadata ?? '{}')
    expect(meta.narrator).toBe('Simon Vance')
  })

  it('orders chapters by track number', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'ch-3',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/Foundation/ch03.m4b',
        fileName: 'ch03.m4b',
        fileSize: 8000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({ album: 'Foundation', trackNumber: 3 }),
      },
      {
        id: 'ch-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/Foundation/ch01.m4b',
        fileName: 'ch01.m4b',
        fileSize: 8000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({ album: 'Foundation', trackNumber: 1 }),
      },
    ])

    await createAudiobookCollections(db, 'lib-1')

    const members = await db.select().from(collectionItems)
    const ch1 = members.find((m) => m.mediaItemId === 'ch-1')
    const ch3 = members.find((m) => m.mediaItemId === 'ch-3')
    expect(ch1?.sortOrder).toBe(1)
    expect(ch3?.sortOrder).toBe(3)
  })

  it('creates series collections when series metadata is present', async () => {
    await db.insert(mediaItems).values({
      id: 'ch-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/audiobooks/Dune/ch01.m4b',
      fileName: 'ch01.m4b',
      fileSize: 10000,
      mediaCategory: MediaCategory.Audiobooks,
      metadata: JSON.stringify({
        album: 'Dune',
        artist: 'Simon Vance',
        series: 'Dune Chronicles',
        trackNumber: 1,
      }),
    })

    await createAudiobookCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const seriesCollections = allCollections.filter(
      (g) => g.type === 'audiobook-series',
    )
    const bookCollections = allCollections.filter((g) => g.type === 'book')

    expect(seriesCollections).toHaveLength(1)
    expect(seriesCollections[0]?.title).toBe('Dune Chronicles')
    expect(bookCollections).toHaveLength(1)
    expect(bookCollections[0]?.parentCollectionId).toBe(
      seriesCollections[0]?.id,
    )
  })

  it('detects series from folder structure when no series tag', async () => {
    await db.insert(mediaItems).values({
      id: 'ch-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/audiobooks/Dune Chronicles/Dune/ch01.m4b',
      fileName: 'ch01.m4b',
      fileSize: 10000,
      mediaCategory: MediaCategory.Audiobooks,
      metadata: JSON.stringify({ trackNumber: 1 }),
    })

    await createAudiobookCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const seriesCollections = allCollections.filter(
      (g) => g.type === 'audiobook-series',
    )
    const bookCollections = allCollections.filter((g) => g.type === 'book')

    expect(seriesCollections).toHaveLength(1)
    expect(seriesCollections[0]?.title).toBe('Dune Chronicles')
    expect(bookCollections[0]?.title).toBe('Dune')
    expect(bookCollections[0]?.parentCollectionId).toBe(
      seriesCollections[0]?.id,
    )
  })

  it('does not duplicate collections or members on repeated calls', async () => {
    await db.insert(mediaItems).values({
      id: 'ch-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/audiobooks/Dune/ch01.m4b',
      fileName: 'ch01.m4b',
      fileSize: 10000,
      mediaCategory: MediaCategory.Audiobooks,
      metadata: JSON.stringify({ album: 'Dune', trackNumber: 1 }),
    })

    await createAudiobookCollections(db, 'lib-1')
    await createAudiobookCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const members = await db.select().from(collectionItems)

    expect(allCollections).toHaveLength(1) // 1 book collection (no series)
    expect(members).toHaveLength(1)
  })

  it('creates separate book collections for different books', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'ch-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/Dune/ch01.m4b',
        fileName: 'ch01.m4b',
        fileSize: 10000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({ album: 'Dune', trackNumber: 1 }),
      },
      {
        id: 'ch-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/Foundation/ch01.m4b',
        fileName: 'ch01.m4b',
        fileSize: 10000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({ album: 'Foundation', trackNumber: 1 }),
      },
    ])

    await createAudiobookCollections(db, 'lib-1')

    const bookCollections = await db.select().from(collections)
    expect(bookCollections).toHaveLength(2)
    const titles = bookCollections.map((g) => g.title).sort()
    expect(titles).toEqual(['Dune', 'Foundation'])
  })

  it('only processes Audiobooks category items', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'ch-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/Dune/ch01.m4b',
        fileName: 'ch01.m4b',
        fileSize: 10000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({ album: 'Dune', trackNumber: 1 }),
      },
      {
        id: 'track-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/audiobooks/music.mp3',
        fileName: 'music.mp3',
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          album: 'Dune',
          artist: 'Someone',
          trackNumber: 1,
        }),
      },
    ])

    await createAudiobookCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const members = await db.select().from(collectionItems)

    // Only the audiobook chapter should be organized
    expect(allCollections).toHaveLength(1)
    expect(members).toHaveLength(1)
    expect(members[0]?.mediaItemId).toBe('ch-1')
  })
})

describe('parseExifDate', () => {
  it('parses standard EXIF date format', () => {
    expect(parseExifDate('2023:10:05 14:32:10')).toBe('2023-10-05')
  })

  it('parses date-only EXIF string', () => {
    expect(parseExifDate('2023:10:05')).toBe('2023-10-05')
  })

  it('returns null for unparseable strings', () => {
    expect(parseExifDate('not a date')).toBeNull()
    expect(parseExifDate('')).toBeNull()
  })
})

describe('parseExifTimestamp', () => {
  it('returns a numeric Unix timestamp for valid EXIF datetime', () => {
    const ts = parseExifTimestamp('2023:10:05 00:00:00')
    expect(ts).toBeGreaterThan(0)
  })

  it('returns 0 for unparseable strings', () => {
    expect(parseExifTimestamp('not a date')).toBe(0)
    expect(parseExifTimestamp('2023:10:05')).toBe(0)
  })

  it('orders earlier photos before later photos', () => {
    const ts1 = parseExifTimestamp('2023:10:05 08:00:00')
    const ts2 = parseExifTimestamp('2023:10:05 18:30:00')
    expect(ts1).toBeLessThan(ts2)
  })
})

describe('clusterCoordinate', () => {
  it('rounds to 1 decimal place', () => {
    expect(clusterCoordinate(37.774)).toBe('37.8')
    expect(clusterCoordinate(-122.419)).toBe('-122.4')
    expect(clusterCoordinate(0)).toBe('0.0')
  })

  it('clusters nearby coordinates to the same value', () => {
    expect(clusterCoordinate(37.71)).toBe(clusterCoordinate(37.74))
  })

  it('keeps distant coordinates in different clusters', () => {
    expect(clusterCoordinate(37.1)).not.toBe(clusterCoordinate(37.2))
  })
})

describe('createPhotoCollections', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)

    await db
      .insert(libraries)
      .values({ id: 'lib-1', name: 'Photos', mediaTypes: '[]' })
    await db.insert(dataSources).values({
      id: 'ds-1',
      libraryId: 'lib-1',
      type: 'local',
      path: '/photos',
    })
  })

  afterEach(() => {
    client.close()
  })

  it('creates date collections for photos with EXIF dateTaken', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'photo-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img001.jpg',
        fileName: 'img001.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({ dateTaken: '2023:10:05 10:00:00' }),
      },
      {
        id: 'photo-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img002.jpg',
        fileName: 'img002.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({ dateTaken: '2023:10:05 15:30:00' }),
      },
      {
        id: 'photo-3',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img003.jpg',
        fileName: 'img003.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({ dateTaken: '2023:10:06 09:00:00' }),
      },
    ])

    await createPhotoCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const dateCollections = allCollections.filter(
      (g) => g.type === 'photo-date',
    )

    expect(dateCollections).toHaveLength(2)
    const titles = dateCollections.map((g) => g.title).sort()
    expect(titles).toEqual(['2023-10-05', '2023-10-06'])
  })

  it('assigns photos to date collections with timestamp sort order', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'photo-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img001.jpg',
        fileName: 'img001.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({ dateTaken: '2023:10:05 10:00:00' }),
      },
      {
        id: 'photo-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img002.jpg',
        fileName: 'img002.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({ dateTaken: '2023:10:05 15:30:00' }),
      },
    ])

    await createPhotoCollections(db, 'lib-1')

    const members = await db.select().from(collectionItems)
    expect(members).toHaveLength(2)
    const sorted = [...members].sort((a, b) => a.sortOrder - b.sortOrder)
    expect(sorted[0]?.mediaItemId).toBe('photo-1')
    expect(sorted[1]?.mediaItemId).toBe('photo-2')
  })

  it('creates location collections for photos with GPS data', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'photo-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img001.jpg',
        fileName: 'img001.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({
          gpsLatitude: 37.774,
          gpsLongitude: -122.419,
        }),
      },
      {
        id: 'photo-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img002.jpg',
        fileName: 'img002.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({
          gpsLatitude: 37.776,
          gpsLongitude: -122.421,
        }),
      },
      {
        id: 'photo-3',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img003.jpg',
        fileName: 'img003.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({ gpsLatitude: 48.856, gpsLongitude: 2.352 }),
      },
    ])

    await createPhotoCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const locCollections = allCollections.filter(
      (g) => g.type === 'photo-location',
    )

    // photo-1 and photo-2 are within same ~11km grid cell; photo-3 is far away
    expect(locCollections).toHaveLength(2)
  })

  it('collections both Pictures and Images categories', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'pic-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img001.jpg',
        fileName: 'img001.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({ dateTaken: '2023:10:05 10:00:00' }),
      },
      {
        id: 'img-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/render.png',
        fileName: 'render.png',
        fileSize: 2000,
        mediaCategory: MediaCategory.Images,
        metadata: JSON.stringify({ dateTaken: '2023:10:05 11:00:00' }),
      },
    ])

    await createPhotoCollections(db, 'lib-1')

    const members = await db.select().from(collectionItems)
    expect(members).toHaveLength(2)
  })

  it('skips photos without dateTaken (no date collection created)', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'photo-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img001.jpg',
        fileName: 'img001.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: '{}',
      },
    ])

    await createPhotoCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    expect(allCollections).toHaveLength(0)
  })

  it('is idempotent on repeated calls', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'photo-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/img001.jpg',
        fileName: 'img001.jpg',
        fileSize: 2000,
        mediaCategory: MediaCategory.Pictures,
        metadata: JSON.stringify({
          dateTaken: '2023:10:05 10:00:00',
          gpsLatitude: 37.774,
          gpsLongitude: -122.419,
        }),
      },
    ])

    await createPhotoCollections(db, 'lib-1')
    await createPhotoCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    const members = await db.select().from(collectionItems)

    expect(allCollections).toHaveLength(2) // 1 date + 1 location
    expect(members).toHaveLength(2) // 1 in date collection + 1 in location collection
  })

  it('does not collection non-photo categories', async () => {
    await db.insert(mediaItems).values([
      {
        id: 'movie-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/photos/movie.mp4',
        fileName: 'movie.mp4',
        fileSize: 5000,
        mediaCategory: MediaCategory.Movies,
        metadata: JSON.stringify({ dateTaken: '2023:10:05 10:00:00' }),
      },
    ])

    await createPhotoCollections(db, 'lib-1')

    const allCollections = await db.select().from(collections)
    expect(allCollections).toHaveLength(0)
  })
})
