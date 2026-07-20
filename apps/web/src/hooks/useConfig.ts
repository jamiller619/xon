import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Config, ConfigKey } from '@xon/shared'
import { useCallback } from 'react'
import { API_ROUTES } from '~/lib/apiRoutes'

export const configQuery = {
  queryKey: ['config'] as const,
  queryFn: async () => {
    const resp = await fetch(API_ROUTES['config.get'])
    return (await resp.json()) as Config
  },
  staleTime: Infinity,
}

export default function useConfig<K extends ConfigKey>(
  key: K,
): [Config[K] | undefined, (value: Config[K]) => Promise<void>] {
  const { data } = useQuery(configQuery)
  const queryClient = useQueryClient()

  const updateConfig = useCallback(
    async (value: Config[K]) => {
      await fetch(API_ROUTES['config.set'], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, value }),
      })

      queryClient.setQueryData(configQuery.queryKey, (prev?: Config) => ({
        ...prev,
        [key]: value,
      }))
    },
    [key, queryClient],
  )

  return [data?.[key], updateConfig] as const
}
