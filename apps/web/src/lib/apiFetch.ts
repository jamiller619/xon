import { useAuthStore } from '../store/authStore.js'

/**
 * fetch wrapper that injects the current access token as a Bearer header.
 * Falls back to unauthenticated for public endpoints (e.g. /api/v1/health).
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
export function apiUrl(url: string): string {
  const token = useAuthStore.getState().accessToken
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${token}`
}
