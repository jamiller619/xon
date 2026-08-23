import { describe, expect, it } from 'vitest'
import { formatDurationSeconds } from './utils'

describe('formatDurationSeconds', () => {
  it('formats a combined album duration', () => {
    expect(formatDurationSeconds(3_725)).toBe('1h 2m')
  })

  it('omits missing and invalid durations', () => {
    expect(formatDurationSeconds()).toBeUndefined()
    expect(formatDurationSeconds(0)).toBeUndefined()
    expect(formatDurationSeconds(Number.NaN)).toBeUndefined()
  })
})
