import { describe, expect, it } from 'vitest'
import { formatWebClientName } from './clientName'

describe('formatWebClientName', () => {
  it('identifies desktop browsers without their version', () => {
    expect(
      formatWebClientName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome - Web')
  })

  it('uses the device name for mobile web clients', () => {
    expect(
      formatWebClientName(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ' +
          'AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone - Web')
  })

  it('falls back to Web for unknown user agents', () => {
    expect(formatWebClientName('unknown')).toBe('Web')
  })
})
