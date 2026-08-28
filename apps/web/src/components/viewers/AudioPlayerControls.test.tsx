import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CyclingTrackTitle } from './AudioPlayerControls'

describe('CyclingTrackTitle', () => {
  it('renders the current track, artist, and album', () => {
    const markup = renderToStaticMarkup(
      <CyclingTrackTitle
        currentTrack={{
          id: 'track-1',
          title: 'Track One',
          artist: 'Artist One',
          album: 'Album One',
          mimeType: 'audio/flac',
        }}
      />,
    )

    expect(markup).toContain('Track One')
    expect(markup).toContain('Artist One')
    expect(markup).toContain('Album One')
    expect(markup).toContain(
      'aria-label="Track One by Artist One from Album One"',
    )
  })

  it('keeps the title static while artist and album metadata load', () => {
    const markup = renderToStaticMarkup(
      <CyclingTrackTitle
        currentTrack={{
          id: 'track-1',
          title: 'Track One',
          mimeType: 'audio/mpeg',
        }}
      />,
    )

    expect(markup).toContain('data-cycling="false"')
    expect(markup).not.toContain('Unknown Artist')
    expect(markup).not.toContain('Unknown Album')
  })
})
