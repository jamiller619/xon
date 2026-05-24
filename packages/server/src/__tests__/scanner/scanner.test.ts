import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaCategory } from '@xon/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanDataSource } from '../../scanner/scanner.ts'

describe('scanDataSource', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xon-scanner-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns empty result for empty directory', async () => {
    const result = await scanDataSource({ path: tmpDir, recursive: true })
    expect(result.discovered).toHaveLength(0)
    expect(result.newFiles).toHaveLength(0)
    expect(result.changedFiles).toHaveLength(0)
    expect(result.removedFilePaths).toHaveLength(0)
  })

  it('discovers media files by extension', async () => {
    await writeFile(join(tmpDir, 'movie.mp4'), Buffer.alloc(1024))
    await writeFile(join(tmpDir, 'song.mp3'), Buffer.alloc(512))
    await writeFile(join(tmpDir, 'readme.log'), 'not a media file')

    const result = await scanDataSource({ path: tmpDir, recursive: false })

    expect(result.discovered).toHaveLength(2)
    const paths = result.discovered.map((e) => e.fileName)
    expect(paths).toContain('movie.mp4')
    expect(paths).toContain('song.mp3')
    expect(paths).not.toContain('readme.log')
  })

  it('returns correct FileEntry fields', async () => {
    const content = Buffer.alloc(2048)
    await writeFile(join(tmpDir, 'video.mp4'), content)

    const result = await scanDataSource({ path: tmpDir, recursive: false })

    expect(result.discovered).toHaveLength(1)
    const entry = result.discovered[0]
    expect(entry).toBeDefined()
    if (!entry) return
    expect(entry.extension).toBe('.mp4')
    expect(entry.mimeType).toBe('video/mp4')
    expect(entry.mediaCategory).toBe(MediaCategory.Movies)
    expect(entry.fileSize).toBe(2048)
    expect(entry.fileName).toBe('video.mp4')
    expect(entry.filePath).toBe(join(tmpDir, 'video.mp4'))
  })

  it('walks subdirectories when recursive is true', async () => {
    const subDir = join(tmpDir, 'subdir')
    await mkdir(subDir)
    await writeFile(join(tmpDir, 'top.mp4'), Buffer.alloc(100))
    await writeFile(join(subDir, 'nested.mkv'), Buffer.alloc(200))

    const result = await scanDataSource({ path: tmpDir, recursive: true })

    expect(result.discovered).toHaveLength(2)
  })

  it('does not walk subdirectories when recursive is false', async () => {
    const subDir = join(tmpDir, 'subdir')
    await mkdir(subDir)
    await writeFile(join(tmpDir, 'top.mp4'), Buffer.alloc(100))
    await writeFile(join(subDir, 'nested.mkv'), Buffer.alloc(200))

    const result = await scanDataSource({ path: tmpDir, recursive: false })

    expect(result.discovered).toHaveLength(1)
    expect(result.discovered[0]?.fileName).toBe('top.mp4')
  })

  it('identifies new files when no existing items', async () => {
    await writeFile(join(tmpDir, 'new.mp4'), Buffer.alloc(500))

    const result = await scanDataSource({ path: tmpDir, recursive: false }, [])

    expect(result.newFiles).toHaveLength(1)
    expect(result.changedFiles).toHaveLength(0)
    expect(result.removedFilePaths).toHaveLength(0)
  })

  it('identifies changed files when file size differs', async () => {
    const filePath = join(tmpDir, 'changed.mp4')
    await writeFile(filePath, Buffer.alloc(500))

    const result = await scanDataSource({ path: tmpDir, recursive: false }, [
      { filePath, fileSize: 100 },
    ])

    expect(result.newFiles).toHaveLength(0)
    expect(result.changedFiles).toHaveLength(1)
    expect(result.changedFiles[0]?.filePath).toBe(filePath)
    expect(result.removedFilePaths).toHaveLength(0)
  })

  it('identifies removed files not found on disk', async () => {
    await writeFile(join(tmpDir, 'existing.mp4'), Buffer.alloc(100))
    const removedPath = join(tmpDir, 'removed.mp4')

    const result = await scanDataSource({ path: tmpDir, recursive: false }, [
      { filePath: join(tmpDir, 'existing.mp4'), fileSize: 100 },
      { filePath: removedPath, fileSize: 200 },
    ])

    expect(result.newFiles).toHaveLength(0)
    expect(result.changedFiles).toHaveLength(0)
    expect(result.removedFilePaths).toHaveLength(1)
    expect(result.removedFilePaths[0]).toBe(removedPath)
  })

  it('handles permission errors gracefully', async () => {
    const result = await scanDataSource(
      { path: '/nonexistent/path/that/does/not/exist', recursive: false },
      [],
    )

    expect(result.discovered).toHaveLength(0)
    expect(result.newFiles).toHaveLength(0)
  })
})
