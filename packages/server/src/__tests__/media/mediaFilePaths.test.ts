import { type DataSource, DataSourceType } from '@xon/shared'
import { describe, expect, it } from 'vitest'
import {
  relativeMediaFilePath,
  resolveMediaFilePath,
} from '../../media/mediaFilePaths.js'

const source: DataSource = {
  id: 'source-1',
  type: DataSourceType.local,
  path: '/mnt/library',
}

describe('media file paths', () => {
  it('stores a POSIX path relative to its data source', () => {
    expect(relativeMediaFilePath('/mnt/library/movies/Alien.mkv', source)).toBe(
      'movies/Alien.mkv',
    )
  })

  it('resolves against the current data source root', () => {
    expect(resolveMediaFilePath('movies/Alien.mkv', source)).toBe(
      '/mnt/library/movies/Alien.mkv',
    )
    expect(
      resolveMediaFilePath('movies/Alien.mkv', {
        ...source,
        path: '/restored/library',
      }),
    ).toBe('/restored/library/movies/Alien.mkv')
  })

  it('supports legacy absolute paths during migration', () => {
    expect(resolveMediaFilePath('/legacy/Alien.mkv', source)).toBe(
      '/legacy/Alien.mkv',
    )
  })

  it.each([
    '../outside.mkv',
    'movies/../../outside.mkv',
    'movies\\Alien.mkv',
  ])('rejects unsafe relative path %j', (filePath) => {
    expect(() => resolveMediaFilePath(filePath, source)).toThrow()
  })

  it('rejects files outside the source when creating a relative path', () => {
    expect(() => relativeMediaFilePath('/mnt/other/file.mkv', source)).toThrow()
  })
})
