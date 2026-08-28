import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AUDIO_PLAYER_STORAGE_KEY = 'xon:audio-player'

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>()

  get length() {
    return this.#values.size
  }

  clear() {
    this.#values.clear()
  }

  getItem(key: string) {
    return this.#values.get(key) ?? null
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.#values.delete(key)
  }

  setItem(key: string, value: string) {
    this.#values.set(key, value)
  }
}

describe('audio store persistence', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores the queue and player state from local storage', async () => {
    storage.setItem(
      AUDIO_PLAYER_STORAGE_KEY,
      JSON.stringify({
        state: {
          queue: [
            {
              id: 'track-1',
              title: 'Track One',
              artist: 'Artist One',
              album: 'Album One',
              mimeType: 'audio/mpeg',
            },
          ],
          currentIndex: 0,
          playing: true,
          volume: 0.42,
          shuffle: true,
          repeat: 'all',
        },
        version: 0,
      }),
    )

    const { useAudioStore } = await import('./audioStore')

    expect(useAudioStore.getState()).toMatchObject({
      queue: [
        {
          id: 'track-1',
          title: 'Track One',
          artist: 'Artist One',
          album: 'Album One',
          mimeType: 'audio/mpeg',
        },
      ],
      currentIndex: 0,
      playing: true,
      volume: 0.42,
      shuffle: true,
      repeat: 'all',
    })
  })

  it('persists serializable player state without store actions', async () => {
    const { useAudioStore } = await import('./audioStore')

    useAudioStore.getState().setVolume(0.36)
    useAudioStore.getState().playTrack({
      id: 'track-1',
      title: 'Track One',
      artist: 'Artist One',
      album: 'Album One',
      mimeType: 'audio/mpeg',
    })
    useAudioStore.getState().toggleShuffle()
    useAudioStore.getState().toggleRepeat()

    const persisted = JSON.parse(
      storage.getItem(AUDIO_PLAYER_STORAGE_KEY) ?? '{}',
    ) as { state?: unknown }

    expect(persisted.state).toEqual({
      queue: [
        {
          id: 'track-1',
          title: 'Track One',
          artist: 'Artist One',
          album: 'Album One',
          mimeType: 'audio/mpeg',
        },
      ],
      currentIndex: 0,
      playing: true,
      volume: 0.36,
      shuffle: true,
      repeat: 'all',
    })
  })
})
