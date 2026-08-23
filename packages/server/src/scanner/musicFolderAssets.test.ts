import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type Client, createClient } from '@libsql/client'
import { CollectionType, DataSourceType } from '@xon/shared'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectionItems, collections } from '../db/schema.ts'
import type { Logger } from '../logger.ts'
import {
  classifyAlbumArtwork,
  importMusicFolderAssets,
  mergeAlbumArtwork,
  parsePlaylistEntries,
} from './musicFolderAssets.ts'

const logger: Logger = {
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

const clients: Client[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
  vi.clearAllMocks()
})

describe('music folder assets', () => {
  it('parses M3U entries while ignoring comments and extended metadata', () => {
    expect(
      parsePlaylistEntries(
        '\uFEFF#EXTM3U\n#EXTINF:123,Artist - Song\n../Album/01 - Song.mp3\n\nmissing.mp3\n',
        '.m3u',
      ),
    ).toEqual(['../Album/01 - Song.mp3', 'missing.mp3'])
  })

  it('parses PLS File entries in their declared order', () => {
    expect(
      parsePlaylistEntries(
        '[playlist]\nFile1=first.mp3\nTitle1=First\nFile2=second.mp3\n',
        '.pls',
      ),
    ).toEqual(['first.mp3', 'second.mp3'])
  })

  it('classifies multiple album artwork categories by filename', () => {
    expect(classifyAlbumArtwork('cover.jpg')).toBe('poster')
    expect(classifyAlbumArtwork('booklet-02.png')).toBe('poster')
    expect(classifyAlbumArtwork('back-cover.jpg')).toBe('backdrop')
    expect(classifyAlbumArtwork('clearlogo.png')).toBe('logo')
  })

  it('keeps every local image in its category and preserves remote artwork', () => {
    const images = mergeAlbumArtwork(
      {
        poster: [{ src: 'https://example.com/cover.jpg' }],
        backdrop: ['https://example.com/back.jpg'],
        logo: 'https://example.com/logo.png',
      },
      [
        {
          category: 'poster',
          source: 'library-images/lib/album-a-front.jpg',
          poster: { src: 'library-images/lib/album-a-front.jpg' },
        },
        {
          category: 'poster',
          source: 'library-images/lib/album-a-booklet.jpg',
          poster: { src: 'library-images/lib/album-a-booklet.jpg' },
        },
        {
          category: 'backdrop',
          source: 'library-images/lib/album-a-back.jpg',
        },
        {
          category: 'logo',
          source: 'library-images/lib/album-a-logo.png',
        },
      ],
      'library-images/lib/album-a-',
    )

    expect(images.poster).toEqual([
      { src: 'library-images/lib/album-a-front.jpg' },
      { src: 'library-images/lib/album-a-booklet.jpg' },
      { src: 'https://example.com/cover.jpg' },
    ])
    expect(images.backdrop).toEqual([
      'library-images/lib/album-a-back.jpg',
      'https://example.com/back.jpg',
    ])
    expect(images.logo).toEqual([
      'library-images/lib/album-a-logo.png',
      'https://example.com/logo.png',
    ])
  })

  it('imports an invalid playlist as an empty collection and reports its paths', async () => {
    const client = createClient({ url: ':memory:' })
    clients.push(client)
    const db: LibSQLDatabase = drizzle(client)
    await client.batch([
      `CREATE TABLE media_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT NOT NULL,
        library_id INTEGER NOT NULL,
        data_source_id TEXT,
        file_path TEXT NOT NULL,
        media_type TEXT NOT NULL,
        file_metadata TEXT NOT NULL,
        metadata TEXT NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        parent_collection_id INTEGER,
        metadata TEXT NOT NULL
      )`,
      `CREATE TABLE collection_items (
        collection_id INTEGER NOT NULL,
        media_item_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (collection_id, media_item_id)
      )`,
    ])

    const directory = await mkdtemp(path.join(tmpdir(), 'xon-playlist-test-'))
    temporaryDirectories.push(directory)
    const playlistPath = path.join(directory, 'Broken playlist.m3u')
    await writeFile(
      playlistPath,
      '#EXTM3U\nZ:\\Music\\Missing Album\\Missing Song.mp3\n',
    )
    const dataSource = {
      id: 'source-1',
      type: DataSourceType.local,
      path: directory,
    }

    await importMusicFolderAssets({
      db,
      libraryId: 1,
      libraryPublicId: 'library-1',
      ownerId: 1,
      dataSource,
      artworkPaths: [],
      playlistPaths: [playlistPath],
      logger,
    })

    const imported = await db.select().from(collections)
    expect(imported).toHaveLength(1)
    expect(imported[0]?.type).toBe(CollectionType.Playlist)
    expect(imported[0]?.title).toBe('Broken playlist')
    expect(JSON.parse(imported[0]?.metadata ?? '{}')).toMatchObject({
      importedPlaylist: {
        entries: 1,
        matchedEntries: 0,
        unresolvedEntries: 1,
      },
    })
    expect(await db.select().from(collectionItems)).toHaveLength(0)
    expect(logger.warn).toHaveBeenCalledWith(
      'Music playlist contains unresolved entries',
      expect.objectContaining({ unresolvedEntries: 1 }),
    )
  })
})
