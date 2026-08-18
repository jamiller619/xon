import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { getAPIError } from '~/lib/apiFetch'
import { sessionsAPI } from '~/lib/rpc'

export type ClientSession = InferResponseType<
  typeof sessionsAPI.index.$get,
  200
>[number]

export const sessionsQueryKey = (userId: string) =>
  ['sessions', userId] as const

export function useSessions(userId: string | undefined) {
  return useQuery({
    queryKey: sessionsQueryKey(userId ?? 'unknown'),
    enabled: userId !== undefined,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await sessionsAPI.index.$get()
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Sessions could not be loaded'),
        )
      }
      return response.json()
    },
  })
}

export function useRevokeSession(userId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await sessionsAPI[':id'].$delete({
        param: { id: sessionId },
      })

      if (response.status === 404) return sessionId
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Session could not be revoked'),
        )
      }
      return sessionId
    },
    onSuccess: (sessionId) => {
      if (!userId) return
      queryClient.setQueryData<ClientSession[]>(
        sessionsQueryKey(userId),
        (current) => current?.filter((session) => session.id !== sessionId),
      )
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) })
    },
  })
}
