import { describe, expect, it } from 'vitest'
import { parseSessionDevice } from '../../services/sessionDevice.ts'

describe('parseSessionDevice', () => {
  it('parses desktop Chrome on Windows', () => {
    expect(
      parseSessionDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toEqual({
      type: 'desktop',
      label: 'Windows · Chrome',
      browser: 'Chrome',
      operatingSystem: 'Windows',
    })
  })

  it('parses mobile Safari on iOS', () => {
    expect(
      parseSessionDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 ' +
          'Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({
      type: 'mobile',
      label: 'iOS · Safari',
      browser: 'Safari',
      operatingSystem: 'iOS',
    })
  })

  it('recognizes an Android tablet without a Mobile token', () => {
    expect(
      parseSessionDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      ),
    ).toMatchObject({
      type: 'tablet',
      label: 'Android · Chrome',
      browser: 'Chrome',
      operatingSystem: 'Android',
    })
  })

  it.each([
    null,
    '',
    'not a useful user agent',
  ])('returns stable fallbacks for %s', (userAgent) => {
    expect(parseSessionDevice(userAgent)).toEqual({
      type: 'unknown',
      label: 'Unknown device',
      browser: 'Unknown browser',
      operatingSystem: 'Unknown operating system',
    })
  })
})
