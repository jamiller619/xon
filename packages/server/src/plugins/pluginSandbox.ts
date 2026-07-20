export type SandboxedFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

/**
 * Create a sandboxed fetch wrapper for a plugin.
 * Only allows requests to declared network domains.
 */
export function createSandboxedFetch(
  pluginId: string,
  allowedDomains: string[],
): SandboxedFetch {
  return async function sandboxedFetch(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    let hostname: string
    try {
      hostname = new URL(url).hostname
    } catch {
      const msg = `[plugin-sandbox:${pluginId}] Network access denied: invalid URL "${url}"`
      console.warn(msg)
      throw new Error(msg)
    }

    const allowed = allowedDomains.some((domain) => {
      return hostname === domain || hostname.endsWith(`.${domain}`)
    })

    if (!allowed) {
      const msg = `[plugin-sandbox:${pluginId}] Network access denied: ${hostname} is not within allowed domains`
      console.warn(`[plugin-sandbox:${pluginId}] fetch denied: ${hostname}`)
      throw new Error(msg)
    }

    return fetch(url, init)
  }
}
