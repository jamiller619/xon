import { useMutation, useQuery } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { getAPIError } from '../lib/apiFetch'
import { librariesAPI } from '../lib/rpc'
import { useScanStore } from '../store/scanStore'

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

    if (!res.ok) {
      throw new Error(await getAPIError(res, 'Library could not be created'))
    }

    return res.json()
  },
}

type UpdateLibraryRequest = InferRequestType<
  (typeof librariesAPI)[':id']['$put']
>

export type UpdateLibraryInput = UpdateLibraryRequest['json'] & {
  id: UpdateLibraryRequest['param']['id']
}

export const updateLibraryMutation = {
  mutationFn: async ({ id, ...json }: UpdateLibraryInput) => {
    const res = await librariesAPI[':id'].$put({ param: { id }, json })

    if (!res.ok) {
      throw new Error(await getAPIError(res, 'Library could not be updated'))
    }

    return res.json()
  },
}

export function useScanLibrary(libraryId: string | undefined) {
  const scanRunning = useScanStore(
    (state) =>
      libraryId !== undefined && state.scans[libraryId]?.status === 'running',
  )

  const mutation = useMutation({
    onMutate: () => {
      if (libraryId) useScanStore.getState().applyStarted(libraryId)
    },
    mutationFn: async () => {
      if (!libraryId) return

      const response = await librariesAPI[':libraryId'].scan.$post({
        param: { libraryId },
      })

      if (response.status === 409) return
      if (!response.ok) {
        throw new Error(await getAPIError(response, 'Could not scan library'))
      }
    },
    onError: () => {
      if (libraryId) useScanStore.getState().remove(libraryId)
    },
  })

  return {
    ...mutation,
    isRunning: mutation.isPending || scanRunning,
  }
}

export function useRefreshMetadata(
  libraryId: string | undefined,
  mediaItemId?: string | undefined,
) {
  const scanRunning = useScanStore(
    (state) =>
      libraryId !== undefined && state.scans[libraryId]?.status === 'running',
  )

  const mutation = useMutation({
    onMutate: () => {
      if (libraryId) useScanStore.getState().applyStarted(libraryId)
    },
    mutationFn: async () => {
      if (!libraryId) return

      const response = await librariesAPI[':libraryId'].scan.refresh.$post({
        param: { libraryId },
        json: mediaItemId ? { mediaItemId } : {},
      })

      if (response.status === 409) return
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Could not refresh library metadata'),
        )
      }
    },
    onError: () => {
      if (libraryId) useScanStore.getState().remove(libraryId)
    },
  })

  return {
    ...mutation,
    isRunning: mutation.isPending || scanRunning,
  }
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
