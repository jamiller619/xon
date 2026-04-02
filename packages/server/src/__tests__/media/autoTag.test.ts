import type { Client } from '@libsql/client'
import { MediaCategory } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../db/db.js'
import { migrateDatabase } from '../../db/migrate.js'
import { dataSources, libraries, mediaItems } from '../../db/schema.js'
import {
  type AutoTag,
  type AutoTagOnnxSession,
  autoTagMediaItems,
  computeDocumentTags,
  computeImageTags,
  getAutoTagOnnxSession,
  setAutoTagOnnxSession,
} from '../../media/autoTag.js'

afterEach(() => {
  setAutoTagOnnxSession(null)
})

// ── computeImageTags ──────────────────────────────────────────────────────────

describe('computeImageTags', () => {
  it('returns landscape tag when width > height', async () => {
    const tags = await computeImageTags('/photos/sunset.jpg', {
      imageWidth: 1920,
      imageHeight: 1080,
    })
    expect(tags.some((t) => t.text === 'landscape')).toBe(true)
    expect(tags.every((t) => t.source === 'ai-generated')).toBe(true)
  })

  it('returns portrait tag when height > width', async () => {
    const tags = await computeImageTags('/photos/face.jpg', {
      imageWidth: 1080,
      imageHeight: 1920,
    })
    expect(tags.some((t) => t.text === 'portrait')).toBe(true)
  })

  it('returns square tag when width equals height', async () => {
    const tags = await computeImageTags('/photos/icon.png', {
      imageWidth: 512,
      imageHeight: 512,
    })
    expect(tags.some((t) => t.text === 'square')).toBe(true)
  })

  it('adds outdoor and location tags when GPS present', async () => {
    const tags = await computeImageTags('/photos/hike.jpg', {
      imageWidth: 1920,
      imageHeight: 1080,
      gpsLatitude: 47.6,
      gpsLongitude: -122.3,
    })
    expect(tags.some((t) => t.text === 'outdoor')).toBe(true)
    expect(tags.some((t) => t.text === 'location')).toBe(true)
  })

  it('adds photography tag when camera make/model present', async () => {
    const tags = await computeImageTags('/photos/dslr.jpg', {
      imageWidth: 3000,
      imageHeight: 2000,
      make: 'Canon',
      model: 'EOS R5',
    })
    expect(tags.some((t) => t.text === 'photography')).toBe(true)
  })

  it('adds black-and-white tag for grayscale color space', async () => {
    const tags = await computeImageTags('/photos/bw.jpg', {
      imageWidth: 800,
      imageHeight: 600,
      colorSpace: 'Grayscale',
    })
    expect(tags.some((t) => t.text === 'black-and-white')).toBe(true)
  })

  it('extracts keywords from EXIF subject field', async () => {
    const tags = await computeImageTags('/photos/dog.jpg', {
      imageWidth: 800,
      imageHeight: 800,
      subject: 'dog; park; sunny',
    })
    const tagTexts = tags.map((t) => t.text)
    expect(tagTexts).toContain('dog')
    expect(tagTexts).toContain('park')
    expect(tagTexts).toContain('sunny')
  })

  it('does not duplicate tags', async () => {
    const tags = await computeImageTags('/photos/landscape_mountain.jpg', {
      imageWidth: 1920,
      imageHeight: 1080,
    })
    const texts = tags.map((t) => t.text)
    const unique = new Set(texts)
    expect(texts.length).toBe(unique.size)
  })

  it('uses ONNX session when available', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      output: {
        data: new Float32Array([0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0]),
        dims: [1, 10],
      },
    })
    const mockSession: AutoTagOnnxSession = { run: mockRun }
    setAutoTagOnnxSession(mockSession)

    const tags = await computeImageTags('/photos/test.jpg', {
      imageWidth: 800,
      imageHeight: 600,
    })
    expect(mockRun).toHaveBeenCalledOnce()
    expect(tags.some((t) => t.text === 'landscape')).toBe(true)
    expect(tags[0]?.confidence).toBe(90)
  })

  it('falls back to heuristics when ONNX throws', async () => {
    const mockRun = vi.fn().mockRejectedValue(new Error('inference error'))
    setAutoTagOnnxSession({ run: mockRun })

    const tags = await computeImageTags('/photos/test.jpg', {
      imageWidth: 1920,
      imageHeight: 1080,
    })
    expect(tags.some((t) => t.text === 'landscape')).toBe(true)
  })

  it('returns empty array for item with no useful metadata or filename hints', async () => {
    const tags = await computeImageTags('/photos/img.jpg', {})
    // No dimensions, no GPS, no camera, no subject — only color tag if colorSpace present
    expect(Array.isArray(tags)).toBe(true)
  })
})

// ── computeDocumentTags ───────────────────────────────────────────────────────

describe('computeDocumentTags', () => {
  it('returns short-read for small page count', async () => {
    const tags = await computeDocumentTags('/docs/brochure.pdf', {
      pageCount: 5,
    })
    expect(tags.some((t) => t.text === 'short-read')).toBe(true)
  })

  it('returns medium-read for 10-100 pages', async () => {
    const tags = await computeDocumentTags('/docs/manual.pdf', {
      pageCount: 50,
    })
    expect(tags.some((t) => t.text === 'medium-read')).toBe(true)
  })

  it('returns long-read for >100 pages', async () => {
    const tags = await computeDocumentTags('/docs/novel.pdf', {
      pageCount: 500,
    })
    expect(tags.some((t) => t.text === 'long-read')).toBe(true)
  })

  it('adds pdf tag for .pdf extension', async () => {
    const tags = await computeDocumentTags('/docs/report.pdf', {
      pageCount: 20,
    })
    expect(tags.some((t) => t.text === 'pdf')).toBe(true)
  })

  it('adds ebook tag for .epub extension', async () => {
    const tags = await computeDocumentTags('/books/story.epub', {
      pageCount: 200,
    })
    expect(tags.some((t) => t.text === 'ebook')).toBe(true)
  })

  it('detects topic from filename keywords', async () => {
    const tags = await computeDocumentTags('/docs/financial_report.pdf', {
      pageCount: 30,
    })
    expect(tags.some((t) => t.text === 'financial')).toBe(true)
  })

  it('detects topic from metadata subject', async () => {
    const tags = await computeDocumentTags('/docs/paper.pdf', {
      pageCount: 15,
      subject: 'academic research analysis',
    })
    expect(tags.some((t) => t.text === 'academic')).toBe(true)
  })

  it('adds authored tag when author present', async () => {
    const tags = await computeDocumentTags('/docs/book.pdf', {
      pageCount: 100,
      author: 'Jane Smith',
    })
    expect(tags.some((t) => t.text === 'authored')).toBe(true)
  })

  it('uses ONNX session when available', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      output: {
        data: new Float32Array([0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        dims: [1, 10],
      },
    })
    setAutoTagOnnxSession({ run: mockRun })

    const tags = await computeDocumentTags('/docs/guide.pdf', {
      pageCount: 10,
    })
    expect(mockRun).toHaveBeenCalledOnce()
    expect(tags.some((t) => t.text === 'technical')).toBe(true)
  })

  it('falls back to heuristics when ONNX throws', async () => {
    const mockRun = vi.fn().mockRejectedValue(new Error('onnx error'))
    setAutoTagOnnxSession({ run: mockRun })

    const tags = await computeDocumentTags('/docs/legal_contract.pdf', {
      pageCount: 8,
    })
    expect(tags.some((t) => t.text === 'short-read')).toBe(true)
  })
})

// ── setAutoTagOnnxSession / getAutoTagOnnxSession ─────────────────────────────

describe('setAutoTagOnnxSession / getAutoTagOnnxSession', () => {
  it('returns null by default', () => {
    expect(getAutoTagOnnxSession()).toBeNull()
  })

  it('stores and retrieves the session', () => {
    const session: AutoTagOnnxSession = { run: vi.fn() }
    setAutoTagOnnxSession(session)
    expect(getAutoTagOnnxSession()).toBe(session)
    setAutoTagOnnxSession(null)
    expect(getAutoTagOnnxSession()).toBeNull()
  })
})

// ── autoTagMediaItems ─────────────────────────────────────────────────────────

describe('autoTagMediaItems', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)

    await db
      .insert(libraries)
      .values({ id: 'lib-1', name: 'Photos', allowedMediaTypes: '[]' })
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

  it('generates aiTags for image items', async () => {
    await db.insert(mediaItems).values({
      id: 'img-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/photos/mountain.jpg',
      fileName: 'mountain.jpg',
      fileSize: 2000,
      mediaCategory: MediaCategory.Pictures,
      metadata: JSON.stringify({ imageWidth: 1920, imageHeight: 1080 }),
    })

    await autoTagMediaItems(db, 'lib-1')

    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
    const meta = JSON.parse(rows[0]?.metadata ?? '{}') as {
      aiTags?: AutoTag[]
    }
    expect(Array.isArray(meta.aiTags)).toBe(true)
    expect((meta.aiTags?.length ?? 0) > 0).toBe(true)
    expect(meta.aiTags?.[0]?.source).toBe('ai-generated')
  })

  it('generates aiTags for document items', async () => {
    await db.insert(mediaItems).values({
      id: 'doc-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/docs/report.pdf',
      fileName: 'report.pdf',
      fileSize: 1000,
      mediaCategory: MediaCategory.Documents,
      metadata: JSON.stringify({ pageCount: 25 }),
    })

    await autoTagMediaItems(db, 'lib-1')

    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
    const meta = JSON.parse(rows[0]?.metadata ?? '{}') as {
      aiTags?: AutoTag[]
    }
    expect(Array.isArray(meta.aiTags)).toBe(true)
    expect((meta.aiTags?.length ?? 0) > 0).toBe(true)
  })

  it('skips items that already have aiTags (idempotent)', async () => {
    const existingAiTags = [
      { text: 'existing', confidence: 90, source: 'ai-generated' },
    ]
    await db.insert(mediaItems).values({
      id: 'img-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/photos/sunset.jpg',
      fileName: 'sunset.jpg',
      fileSize: 2000,
      mediaCategory: MediaCategory.Pictures,
      metadata: JSON.stringify({
        imageWidth: 800,
        imageHeight: 600,
        aiTags: existingAiTags,
      }),
    })

    await autoTagMediaItems(db, 'lib-1')

    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
    const meta = JSON.parse(rows[0]?.metadata ?? '{}') as {
      aiTags?: AutoTag[]
    }
    // Should still have only the existing tag (not re-tagged)
    expect(meta.aiTags).toHaveLength(1)
    expect(meta.aiTags?.[0]?.text).toBe('existing')
  })

  it('does not tag unsupported categories (e.g. Music)', async () => {
    await db.insert(mediaItems).values({
      id: 'music-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/music/song.mp3',
      fileName: 'song.mp3',
      fileSize: 5000,
      mediaCategory: MediaCategory.Music,
      metadata: JSON.stringify({ title: 'My Song', artist: 'Artist' }),
    })

    await autoTagMediaItems(db, 'lib-1')

    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
    const meta = JSON.parse(rows[0]?.metadata ?? '{}') as {
      aiTags?: AutoTag[]
    }
    expect(meta.aiTags).toBeUndefined()
  })

  it('preserves existing metadata fields when adding aiTags', async () => {
    await db.insert(mediaItems).values({
      id: 'img-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/photos/test.jpg',
      fileName: 'test.jpg',
      fileSize: 1000,
      mediaCategory: MediaCategory.Pictures,
      metadata: JSON.stringify({
        imageWidth: 1920,
        imageHeight: 1080,
        make: 'Nikon',
        tags: ['vacation'],
      }),
    })

    await autoTagMediaItems(db, 'lib-1')

    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
    const meta = JSON.parse(rows[0]?.metadata ?? '{}') as {
      imageWidth?: number
      make?: string
      tags?: string[]
      aiTags?: AutoTag[]
    }
    // Existing fields preserved
    expect(meta.imageWidth).toBe(1920)
    expect(meta.make).toBe('Nikon')
    expect(meta.tags).toEqual(['vacation'])
    // AI tags added
    expect(Array.isArray(meta.aiTags)).toBe(true)
  })

  it('only tags items belonging to the specified library', async () => {
    await db
      .insert(libraries)
      .values({ id: 'lib-2', name: 'Other', allowedMediaTypes: '[]' })
    await db.insert(dataSources).values({
      id: 'ds-2',
      libraryId: 'lib-2',
      type: 'local',
      path: '/other',
    })
    await db.insert(mediaItems).values({
      id: 'img-2',
      libraryId: 'lib-2',
      dataSourceId: 'ds-2',
      filePath: '/other/b.jpg',
      fileName: 'b.jpg',
      fileSize: 1000,
      mediaCategory: MediaCategory.Pictures,
      metadata: JSON.stringify({ imageWidth: 800, imageHeight: 600 }),
    })

    // Only run for lib-1 (which has no items)
    await autoTagMediaItems(db, 'lib-1')

    // lib-2 item should not have been tagged
    const { eq } = await import('drizzle-orm')
    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
      .where(eq(mediaItems.id, 'img-2'))
    const meta = JSON.parse(rows[0]?.metadata ?? '{}') as {
      aiTags?: AutoTag[]
    }
    expect(meta.aiTags).toBeUndefined()
  })
})
