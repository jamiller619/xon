import { useAuthStore } from "./store/index.js";

/**
 * fetch wrapper that injects the current access token as a Bearer header.
 * Falls back to unauthenticated for public endpoints (e.g. /api/v1/health).
 */
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}
