import type { LibrariesRoutes } from '@xon/server'
import { hc } from 'hono/client'
import { useAuthStore } from '~/store/authStore'

/**
 * Injects the current access token, mirroring apiFetch. Read lazily per
 * request so the client picks up token changes after login/refresh.
 */
function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken

  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Typed RPC client for /api/libraries. Route paths, params, request bodies,
 * and response types are inferred from the server's LibrariesRoutes schema.
 */
export const librariesAPI = hc<LibrariesRoutes>('/api/libraries', {
  headers: authHeaders,
})
