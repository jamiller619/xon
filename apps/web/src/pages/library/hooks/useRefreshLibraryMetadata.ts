import { useMutation } from '@tanstack/react-query'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import { useScanStore } from '~/store/scanStore'

export function useRefreshLibraryMetadata(libraryId: string | undefined) {
  const scanRunning = useScanStore(
    (state) =>
      (libraryId ? state.scans[libraryId]?.status : undefined) === 'running',
  )

  const mutation = useMutation({
    mutationFn: async () => {
      if (!libraryId) throw new Error('Library is unavailable')

      const response = await apiFetch(
        `/api/libraries/${libraryId}/scan/refresh`,
        { method: 'POST' },
      )
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Could not refresh library metadata'),
        )
      }
    },
  })

  return {
    refresh: mutation.mutate,
    isRefreshing: mutation.isPending || scanRunning,
    error: mutation.error,
  }
}
