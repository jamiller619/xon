import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AudioQueuePanel from './AudioQueuePanel'

const queueState = vi.hoisted(() => ({
  queue: [
    { id: 'track-1', title: 'Track One', mimeType: 'audio/mpeg' },
    { id: 'track-2', title: 'Track Two', mimeType: 'audio/mpeg' },
  ],
  currentIndex: 1,
  playing: true,
  playAtIndex: vi.fn(),
  removeFromQueue: vi.fn(),
  clearQueue: vi.fn(),
  moveUp: vi.fn(),
  moveDown: vi.fn(),
}))

vi.mock('~/store/audioStore', () => ({
  useAudioStore: (selector: (state: typeof queueState) => unknown) =>
    selector(queueState),
}))

describe('AudioQueuePanel', () => {
  beforeEach(() => {
    queueState.currentIndex = 1
    queueState.playing = true
  })

  it('marks the playing queue item as current', () => {
    const markup = renderToStaticMarkup(<AudioQueuePanel />)
    const currentRow = markup.match(
      /<li[^>]*aria-current="true"[^>]*>.*?<\/li>/,
    )?.[0]

    expect(currentRow).toContain('Track Two')
    expect(currentRow).not.toContain('Track One')
  })

  it('does not mark the current queue item while playback is paused', () => {
    queueState.playing = false

    expect(renderToStaticMarkup(<AudioQueuePanel />)).not.toContain(
      'aria-current="true"',
    )
  })
})
