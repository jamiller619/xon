export const SESSION_CLIENT_NAME_HEADER = 'X-Xon-Client-Name'
export const SESSION_CLIENT_NAME_MAX_LENGTH = 80

export function normalizeSessionClientName(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? ''
  return normalized ? normalized.slice(0, SESSION_CLIENT_NAME_MAX_LENGTH) : null
}

export function sessionClientNameFromHeaders(
  headers: Headers | undefined,
): string | null {
  return normalizeSessionClientName(headers?.get(SESSION_CLIENT_NAME_HEADER))
}
