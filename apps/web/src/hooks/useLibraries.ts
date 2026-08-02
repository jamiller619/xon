import { useQuery } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { librariesAPI } from '../lib/rpc'

/** A library as actually serialized over the wire (dates are strings). */
export type LibraryResponse = InferResponseType<
  typeof librariesAPI.index.$get,
  200
>[number]

export type CreateLibraryInput = InferRequestType<
  typeof librariesAPI.index.$post
>['json']

export const createLibraryMutation = {
  mutationFn: async (data: CreateLibraryInput) => {
    const res = await librariesAPI.index.$post({ json: data })

    if (!res.ok) throw new Error(res.statusText)

    return res.json()
  },
}

export default function useLibraries() {
  return useQuery({
    queryKey: ['libraries'] as const,
    queryFn: async () => {
      const res = await librariesAPI.index.$get()

      if (!res.ok) throw new Error(res.statusText)

      const data = await res.json()

      return data.map((library: LibraryResponse) => ({
        ...library,
        createdAt: new Date(library.createdAt),
        updatedAt: library.updatedAt ? new Date(library.updatedAt) : null,
      }))
    },
  })
}
