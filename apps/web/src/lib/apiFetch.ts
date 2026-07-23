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

export function artworkUrl(
  mediaId: string,
  kind: 'poster' | 'backdrop' | 'logo',
  index: number,
): string {
  return apiUrl(`/api/media/${mediaId}/images/${kind}/${index}`)
}

/**
 * Resolve a media item's poster to a resized image served by our thumbnail
 * endpoint. Keeping every poster behind this endpoint prevents remote
 * full-resolution artwork and local originals from being sent directly to
 * thumbnail-sized UI surfaces.
 */
export function thumbnailUrl(
  item: {
    id: string
    updatedAt?: Date | string | null
    metadata?: { images?: { poster?: PosterInput } }
  },
  size: 'small' | 'medium' | 'large' = 'medium',
): string | undefined {
  const first = posterImages(item.metadata?.images?.poster)[0]
  if (!first) return undefined

  // The thumbnail endpoint is intentionally cached as immutable. Give each
  // poster revision a distinct URL so an invalidated media query also causes
  // <img> elements to load the user's newly selected artwork.
  const revision = thumbnailRevision(first, item.updatedAt)
  return apiUrl(`/api/media/${item.id}/thumbnail?size=${size}&v=${revision}`)
}

function thumbnailRevision(
  poster: ReturnType<typeof posterImages>[number],
  updatedAt: Date | string | null | undefined,
): string {
  const value = [
    poster.src,
    poster.thumbnails?.small ?? '',
    poster.thumbnails?.medium ?? '',
    poster.thumbnails?.large ?? '',
    updatedAt == null ? '' : String(updatedAt),
  ].join('\0')

  // FNV-1a keeps local file paths out of request URLs while producing a stable
  // cache key for the current poster metadata.
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
