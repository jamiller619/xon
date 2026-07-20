import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryType } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiscoveryContext } from '../../scanner/discoverers/MediaDiscoverer.ts'
import {
  isSampleFile,
  LocalDiscoverer,
} from '../../scanner/discoverers/LocalDiscoverer.ts'

describe('isSampleFile', () => {
  it.each([
    'movie-sample.mkv',
    'movie.sample.mkv',
    'movie_sample.mkv',
    'Movie Sample.mkv',
    'sample.mkv',
    'SAMPLE-movie.mkv',
  ])('matches %s', (name) => {
    expect(isSampleFile(name)).toBe(true)
  })

  it.each([
    'The Sampler (2019).mkv',
    'samples-of-life.mkv',
    'Free Samples (2012).mkv',
    'movie.mkv',
  ])('does not match %s', (name) => {
    expect(isSampleFile(name)).toBe(false)
  })
})

describe('LocalDiscoverer sample filtering', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xon-discoverer-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  function createContext(libraryType: LibraryType): DiscoveryContext {
    return {
      // discover() only touches the db for previously-seen files; every
      // file in these tests is new, so a stub is safe
      db: {} as LibSQLDatabase,
      libraryId: crypto.randomUUID(),
      dataSource: { path: tmpDir } as DiscoveryContext['dataSource'],
      extSet: new Set(['.mkv', '.mp4', '.mp3']),
      libraryType,
    }
  }

  it('excludes sample files and Sample directories in movie libraries', async () => {
    await writeFile(join(tmpDir, 'movie.mkv'), Buffer.alloc(1024))
    await writeFile(join(tmpDir, 'movie-sample.mkv'), Buffer.alloc(64))
    const sampleDir = join(tmpDir, 'Sample')
    await mkdir(sampleDir)
    await writeFile(join(sampleDir, 'inner.mkv'), Buffer.alloc(64))

    const discovery = await new LocalDiscoverer().discover(
      createContext(LibraryType.Movies),
    )

    expect(discovery.totalDiscovered).toBe(1)
    expect(discovery.jobs.map((j) => j.file.name)).toEqual(['movie.mkv'])
  })

  it('does not filter sample-named files in music libraries', async () => {
    await writeFile(join(tmpDir, 'drum-sample.mp3'), Buffer.alloc(64))

    const discovery = await new LocalDiscoverer().discover(
      createContext(LibraryType.Music),
    )

    expect(discovery.jobs.map((j) => j.file.name)).toEqual(['drum-sample.mp3'])
  })
})
