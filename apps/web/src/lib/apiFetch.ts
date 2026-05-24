import { useAuthStore } from '~/store/authStore'

export async function getAPIError(
  res: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? fallbackMessage
  } catch {
    return fallbackMessage
  }
}

/**
 * fetch wrapper that injects the current access token as a Bearer header.
 * Falls back to unauthenticated for public endpoints (e.g. /api/health).
 */
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(url, { ...init, headers })
}

/**
 * Appends the current access token as a ?token= query param to a URL.
 * Use this for <img src>, <video src>, <track src>, and other browser-native
 * requests that cannot send custom headers.
 */
export function apiUrl(url: string | string[]): string {
  const resolvedURL = Array.isArray(url) ? url[0] : url

  if (!resolvedURL) throw new Error('Invalid API URL')

  const token = useAuthStore.getState().accessToken

  if (!token) return resolvedURL

  const sep = url.includes('?') ? '&' : '?'

  return `${url}${sep}token=${token}`
}

function resolveUrl(url: string | string[]): string {
  if (typeof url === 'string') return url

  return url.join('/')
}
