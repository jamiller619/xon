import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetMediaProviderPluginRegistry,
  registerMediaProviderPlugin,
} from '../../plugins/mediaProviderPluginRegistry.js'
import { scanDataSource } from '../../scanner/scanner.js'

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
  access: vi.fn(),
}))

function makePlugin(
  files: Array<{
    id: string
    name: string
    path: string
    size: number
    mimeType?: string
  }>,
) {
  return {
    manifest: {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      description: '',
      author: '',
      category: 'MediaProvider' as const,
    },
    configSchema: { fields: [] },
    init: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    uninstall: vi.fn(),
    listFiles: vi.fn().mockResolvedValue(files),
    getFile: vi.fn(),
    getStream: vi.fn(),
    watch: vi.fn(),
  }
}

beforeEach(() => {
  _resetMediaProviderPluginRegistry()
})

describe('scanDataSource with plugin type', () => {
  it('calls plugin.listFiles and returns discovered media files', async () => {
    const plugin = makePlugin([
      { id: '1', name: 'movie.mp4', path: '/remote/movie.mp4', size: 1000 },
      { id: '2', name: 'song.mp3', path: '/remote/song.mp3', size: 500 },
    ])
    registerMediaProviderPlugin('test-provider', plugin as never)

    const result = await scanDataSource({
      type: 'plugin',
      path: '/remote',
      recursive: true,
      pluginId: 'test-provider',
    })

    expect(plugin.listFiles).toHaveBeenCalledWith('/remote')
    expect(result.discovered).toHaveLength(2)
    expect(result.discovered[0]?.filePath).toBe('/remote/movie.mp4')
    expect(result.discovered[0]?.fileName).toBe('movie.mp4')
    expect(result.discovered[0]?.fileSize).toBe(1000)
    expect(result.discovered[1]?.filePath).toBe('/remote/song.mp3')
  })

  it('filters out files with unknown media category', async () => {
    const plugin = makePlugin([
      { id: '1', name: 'movie.mp4', path: '/remote/movie.mp4', size: 1000 },
      {
        id: '2',
        name: 'readme.unknown_ext_xyz',
        path: '/remote/readme.unknown_ext_xyz',
        size: 100,
      },
    ])
    registerMediaProviderPlugin('test-provider', plugin as never)

    const result = await scanDataSource({
      type: 'plugin',
      path: '/remote',
      recursive: true,
      pluginId: 'test-provider',
    })

    expect(result.discovered).toHaveLength(1)
    expect(result.discovered[0]?.fileName).toBe('movie.mp4')
  })

  it('returns empty array if plugin is not registered', async () => {
    const result = await scanDataSource({
      type: 'plugin',
      path: '/remote',
      recursive: true,
      pluginId: 'missing-provider',
    })

    expect(result.discovered).toHaveLength(0)
    expect(result.newFiles).toHaveLength(0)
  })

  it('classifies new vs existing files correctly', async () => {
    const plugin = makePlugin([
      { id: '1', name: 'movie.mp4', path: '/remote/movie.mp4', size: 1000 },
      { id: '2', name: 'song.mp3', path: '/remote/song.mp3', size: 500 },
    ])
    registerMediaProviderPlugin('test-provider', plugin as never)

    const existing = [{ filePath: '/remote/movie.mp4', fileSize: 1000 }]

    const result = await scanDataSource(
      {
        type: 'plugin',
        path: '/remote',
        recursive: true,
        pluginId: 'test-provider',
      },
      existing,
    )

    expect(result.newFiles).toHaveLength(1)
    expect(result.newFiles[0]?.fileName).toBe('song.mp3')
    expect(result.changedFiles).toHaveLength(0)
    expect(result.removedFilePaths).toHaveLength(0)
  })

  it('detects changed files (size difference)', async () => {
    const plugin = makePlugin([
      { id: '1', name: 'movie.mp4', path: '/remote/movie.mp4', size: 2000 },
    ])
    registerMediaProviderPlugin('test-provider', plugin as never)

    const existing = [{ filePath: '/remote/movie.mp4', fileSize: 1000 }]

    const result = await scanDataSource(
      {
        type: 'plugin',
        path: '/remote',
        recursive: true,
        pluginId: 'test-provider',
      },
      existing,
    )

    expect(result.changedFiles).toHaveLength(1)
    expect(result.changedFiles[0]?.fileName).toBe('movie.mp4')
    expect(result.newFiles).toHaveLength(0)
  })

  it('detects removed files (in existing but not in plugin listing)', async () => {
    const plugin = makePlugin([
      { id: '1', name: 'movie.mp4', path: '/remote/movie.mp4', size: 1000 },
    ])
    registerMediaProviderPlugin('test-provider', plugin as never)

    const existing = [
      { filePath: '/remote/movie.mp4', fileSize: 1000 },
      { filePath: '/remote/deleted.mp4', fileSize: 500 },
    ]

    const result = await scanDataSource(
      {
        type: 'plugin',
        path: '/remote',
        recursive: true,
        pluginId: 'test-provider',
      },
      existing,
    )

    expect(result.removedFilePaths).toEqual(['/remote/deleted.mp4'])
  })

  it('uses plugin mimeType when provided', async () => {
    const plugin = makePlugin([
      {
        id: '1',
        name: 'video.mp4',
        path: '/remote/video.mp4',
        size: 1000,
        mimeType: 'video/mp4',
      },
    ])
    registerMediaProviderPlugin('test-provider', plugin as never)

    const result = await scanDataSource({
      type: 'plugin',
      path: '/remote',
      recursive: true,
      pluginId: 'test-provider',
    })

    expect(result.discovered[0]?.mimeType).toBe('video/mp4')
  })

  it('falls back to local scan for non-plugin type', async () => {
    // When type is "local", it should not call the plugin (walkDirectory used instead)
    const plugin = makePlugin([])
    registerMediaProviderPlugin('test-provider', plugin as never)

    // scanDataSource with local type on a non-existent path returns empty (readdir fails)
    const result = await scanDataSource({
      type: 'local',
      path: '/nonexistent',
      recursive: false,
      pluginId: 'test-provider',
    })

    expect(plugin.listFiles).not.toHaveBeenCalled()
    expect(result.discovered).toHaveLength(0)
  })
})
