import type { Library } from '@xon/shared'
import { apiFetch } from './apiFetch'

const sharedHeaders = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
}

export async function createLibrary<T>(data: T) {
  const resp = await apiFetch('/api/libraries', {
    ...sharedHeaders,
    body: JSON.stringify(data),
  })

  if (!resp.ok) {
    throw new Error(resp.statusText)
  }

  return (await resp.json()) as Library
}
