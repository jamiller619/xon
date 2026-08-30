import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VideoPlayerControls from './VideoPlayerControls'

const mediaStyles = readFileSync(
  new URL('../Media.module.css', import.meta.url),
  'utf8',
)

const mediaState = vi.hoisted(() => ({
  paused: true,
  muted: false,
  volume: 0.72,
  fullscreen: false,
  pictureInPicture: false,
  canPictureInPicture: true,
  waiting: false,
}))

vi.mock('@xon/ui', async () => {
  const { createElement } = await import('react')
  return {
    Select: (props: React.ComponentProps<'select'>) =>
      createElement('select', props),
  }
})

vi.mock('~/components/icons/playback', async () => {
  const { createElement } = await import('react')
  const icon = () => createElement('svg', { 'aria-hidden': true })

  return {
    PauseIcon: icon,
    PlayIcon: icon,
    SoundIcon: icon,
  }
})

vi.mock('@vidstack/react', async () => {
  const { createElement } = await import('react')

  const div = ({
    children,
    ...props
  }: React.ComponentProps<'div'> & { children?: React.ReactNode }) =>
    createElement('div', props, children)
  const button = ({
    children,
    seconds: _seconds,
    ...props
  }: React.ComponentProps<'button'> & {
    children?: React.ReactNode
    seconds?: number
  }) => createElement('button', props, children)
  const gesture = ({
    action: _action,
    event: _event,
    ...props
  }: React.ComponentProps<'span'> & { action?: string; event?: string }) =>
    createElement('span', props)

  return {
    Captions: div,
    Controls: { Root: div, Group: div },
    FullscreenButton: button,
    Gesture: gesture,
    MuteButton: button,
    PIPButton: button,
    PlayButton: button,
    SeekButton: button,
    Time: ({
      type,
      ...props
    }: React.ComponentProps<'span'> & { type: string }) =>
      createElement('span', props, type === 'current' ? '1:24' : '2:08:10'),
    TimeSlider: {
      Root: div,
      Track: div,
      Progress: div,
      TrackFill: div,
      Thumb: div,
    },
    VolumeSlider: {
      Root: div,
      Track: div,
      TrackFill: div,
      Thumb: div,
    },
    useAudioOptions: () =>
      Object.assign(
        [
          {
            value: '0',
            label: 'English',
            selected: true,
            select: vi.fn(),
          },
          {
            value: '1',
            label: 'Commentary',
            selected: false,
            select: vi.fn(),
          },
        ],
        { disabled: false, selectedValue: '0', selectedTrack: null },
      ),
    useCaptionOptions: () =>
      Object.assign(
        [
          { value: 'off', label: 'Off', selected: true, select: vi.fn() },
          {
            value: 'en',
            label: 'English',
            selected: false,
            select: vi.fn(),
          },
        ],
        { disabled: false, selectedValue: 'off', selectedTrack: null },
      ),
    useMediaState: (key: keyof typeof mediaState) => mediaState[key],
  }
})

afterEach(() => {
  Object.assign(mediaState, {
    paused: true,
    muted: false,
    volume: 0.72,
    fullscreen: false,
    pictureInPicture: false,
    canPictureInPicture: true,
    waiting: false,
  })
})

describe('VideoPlayerControls', () => {
  it('renders the audio-player control hierarchy with video actions', () => {
    const markup = renderToStaticMarkup(
      <VideoPlayerControls title="Arrival" mediaType="movie" />,
    )

    expect(markup).toContain('Arrival')
    expect(markup).toContain('movie')
    expect(markup).toContain('aria-label="Back 10 seconds"')
    expect(markup).toContain('aria-label="Play"')
    expect(markup).toContain('aria-label="Forward 10 seconds"')
    expect(markup).toContain('aria-label="Seek"')
    expect(markup).toContain('aria-label="Volume"')
    expect(markup).toContain('aria-label="Audio track"')
    expect(markup).toContain('aria-label="Subtitles"')
    expect(markup).toContain('aria-label="Picture in picture"')
    expect(markup).toContain('aria-label="Fullscreen"')
  })

  it('reflects active playback, mute, fullscreen, and buffering states', () => {
    Object.assign(mediaState, {
      paused: false,
      muted: true,
      fullscreen: true,
      pictureInPicture: true,
      waiting: true,
    })

    const markup = renderToStaticMarkup(
      <VideoPlayerControls title="Arrival" mediaType="movie" />,
    )

    expect(markup).toContain('aria-label="Pause"')
    expect(markup).toContain('aria-label="Unmute"')
    expect(markup).toContain('aria-label="Exit fullscreen"')
    expect(markup).toContain('aria-label="Exit picture in picture"')
    expect(markup).toContain('aria-label="Buffering"')
  })
})

describe('video poster visibility', () => {
  it('only reveals the custom poster while Vidstack marks it visible', () => {
    expect(mediaStyles).toMatch(
      /\.videoPoster\s*{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/,
    )
    expect(mediaStyles).toMatch(
      /\.videoPoster\[data-visible\]\s*{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/,
    )
  })
})
