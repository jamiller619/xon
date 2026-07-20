import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSandboxedFetch } from '../../plugins/pluginSandbox.ts'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── createSandboxedFetch ────────────────────────────────────────────────────

describe('createSandboxedFetch', () => {
  const pluginId = 'net-plugin'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('allows request to a declared domain', async () => {
    const fakeResponse = new Response('ok')
    vi.mocked(globalThis.fetch).mockResolvedValue(fakeResponse)

    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com'])
    const result = await sandboxedFetch('https://api.example.com/data')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      undefined,
    )
    expect(result).toBe(fakeResponse)
  })

  it('passes RequestInit through to fetch', async () => {
    const fakeResponse = new Response('ok')
    vi.mocked(globalThis.fetch).mockResolvedValue(fakeResponse)

    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com'])
    const init: RequestInit = {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    }
    await sandboxedFetch('https://api.example.com/post', init)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/post',
      init,
    )
  })

  it('allows request to a subdomain of a declared domain', async () => {
    const fakeResponse = new Response('ok')
    vi.mocked(globalThis.fetch).mockResolvedValue(fakeResponse)

    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com'])
    await sandboxedFetch('https://v2.api.example.com/resource')

    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('throws for request to an undeclared domain', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com'])

    await expect(sandboxedFetch('https://evil.com/steal')).rejects.toThrow(
      '[plugin-sandbox:net-plugin] Network access denied: evil.com is not within allowed domains',
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('blocks all requests when allowedDomains is empty', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, [])

    await expect(sandboxedFetch('https://example.com/api')).rejects.toThrow(
      'Network access denied',
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('throws for an invalid URL', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, ['example.com'])

    await expect(sandboxedFetch('not-a-url')).rejects.toThrow(
      'Network access denied',
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does not allow a domain that merely contains the allowed domain as a substring', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, ['example.com'])

    // "notexample.com" should NOT be allowed just because it ends with "example.com"
    await expect(sandboxedFetch('https://notexample.com/api')).rejects.toThrow(
      'Network access denied',
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
