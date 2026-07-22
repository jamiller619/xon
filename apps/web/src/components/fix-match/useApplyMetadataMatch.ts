import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import type { SelectedMatch } from './types'

type ApplyVariables = SelectedMatch

export function useApplyMetadataMatch(mediaId: string, libraryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: ApplyVariables) => {
      const response = await apiFetch(`/api/media/${mediaId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variables),
      })
      if (!response.ok) {
        throw new Error(await getAPIError(response, 'Could not apply match'))
      }
      return response.json() as Promise<{
        warnings: Array<{ providerId: string; error: string }>
      }>
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['library-media', libraryId],
        }),
        queryClient.invalidateQueries({ queryKey: ['media', mediaId] }),
      ])
    },
  })
}
