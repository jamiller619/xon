import { type PosterInput, posterImages } from '@xon/shared'
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

export function apiPost(url: string): Promise<Response> {
  return apiFetch(url, {
    method: 'POST',
  })
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

/**
 * Resolve a media item's poster to a servable image URL. Remote posters
 * (e.g. TMDB `https://…`) are used directly; locally generated thumbnails are
 * served through the API by id + size, since their on-disk paths aren't
 * web-accessible.
 */
export function thumbnailUrl(
  item: { id: string; metadata?: { images?: { poster?: PosterInput } } },
  size: 'small' | 'medium' | 'large' = 'medium',
): string | undefined {
  const first = posterImages(item.metadata?.images?.poster)[0]
  if (!first) return undefined

  const url = /^https?:\/\//.test(first.src)
    ? first.src
    : `/api/media/${item.id}/thumbnail?size=${size}`

  return apiUrl(url)
}
