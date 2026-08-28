import { describe, expect, it } from 'vitest'
import {
  endedPlaybackAction,
  formatPlaybackTime,
  normalizeMediaTime,
} from './audioPlayerUtils'

describe('audio player utilities', () => {
  it('formats finite playback positions', () => {
    expect(formatPlaybackTime(0)).toBe('0:00')
    expect(formatPlaybackTime(65.9)).toBe('1:05')
    expect(formatPlaybackTime(3_725)).toBe('62:05')
  })

  it('normalizes unusable media times', () => {
    expect(normalizeMediaTime(Number.NaN)).toBe(0)
    expect(normalizeMediaTime(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizeMediaTime(-1)).toBe(0)
  })

  it('restarts repeat-one tracks and advances in other repeat modes', () => {
    expect(endedPlaybackAction('one')).toBe('restart')
    expect(endedPlaybackAction('all')).toBe('advance')
    expect(endedPlaybackAction('none')).toBe('advance')
  })
})
