import { describe, expect, it } from 'vitest'
import {
  normalizeSessionClientName,
  SESSION_CLIENT_NAME_MAX_LENGTH,
  sessionClientNameFromHeaders,
} from '../../services/sessionClient.ts'

describe('session client names', () => {
  it('normalizes and bounds names supplied by clients', () => {
    expect(normalizeSessionClientName('  Chrome   - Web  ')).toBe(
      'Chrome - Web',
    )
    expect(normalizeSessionClientName('x'.repeat(100))).toHaveLength(
      SESSION_CLIENT_NAME_MAX_LENGTH,
    )
  })

  it('treats blank or missing names as absent', () => {
    expect(normalizeSessionClientName('   ')).toBeNull()
    expect(normalizeSessionClientName(null)).toBeNull()
  })

  it('reads the formal client-name header', () => {
    expect(
      sessionClientNameFromHeaders(
        new Headers({ 'X-Xon-Client-Name': 'Apple TV - App' }),
      ),
    ).toBe('Apple TV - App')
  })
})
