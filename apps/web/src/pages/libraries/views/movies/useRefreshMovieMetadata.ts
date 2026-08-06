import { useMutation } from '@tanstack/react-query'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import { useScanStore } from '~/store/scanStore'

export function useRefreshMovieMetadata(libraryId: string) {
  const scanRunning = useScanStore(
    (state) => state.scans[libraryId]?.status === 'running',
  )

  const mutation = useMutation({
    mutationFn: async () => {
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
