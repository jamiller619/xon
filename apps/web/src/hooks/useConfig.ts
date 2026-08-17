import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Config, ConfigKey } from '@xon/shared'
import { useCallback } from 'react'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import { API_ROUTES } from '~/lib/apiRoutes'

export type ConfigBootstrap = Pick<Config, 'session.enableAnonymousLogins'>

export type ConfigMutation<K extends ConfigKey = ConfigKey> =
  | { operation: 'set'; key: K; value: Config[K] }
  | { operation: 'unset'; key: K }

export type ConfigMutationResult<K extends ConfigKey = ConfigKey> = {
  key: K
  value?: Config[K]
}

export const configBootstrapQuery = {
  queryKey: ['config', 'bootstrap'] as const,
  queryFn: async () => {
    const response = await fetch(API_ROUTES['config.bootstrap'])
    if (!response.ok) {
      throw new Error(
        await getAPIError(response, 'Authentication settings could not load'),
      )
    }
    return (await response.json()) as ConfigBootstrap
  },
  staleTime: Infinity,
}

export const configQuery = {
  queryKey: ['config'] as const,
  queryFn: async () => {
    const response = await apiFetch(API_ROUTES['config.get'])
    if (!response.ok) {
      throw new Error(await getAPIError(response, 'Settings could not load'))
    }
    return (await response.json()) as Config
  },
  staleTime: Infinity,
}

export function useConfigQuery() {
  return useQuery(configQuery)
}

export function useConfigBootstrapQuery() {
  return useQuery(configBootstrapQuery)
}

export function useConfigMutation() {
  const queryClient = useQueryClient()

  return useCallback(
    async <K extends ConfigKey>(
      mutation: ConfigMutation<K>,
    ): Promise<ConfigMutationResult<K>> => {
      const response = await apiFetch(API_ROUTES['config.set'], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation),
        keepalive: true,
      })

      if (!response.ok) {
        throw new Error(await getAPIError(response, 'Setting could not save'))
      }

      const result = (await response.json()) as ConfigMutationResult<K>
      queryClient.setQueryData(configQuery.queryKey, (previous?: Config) => {
        if (!previous) return previous

        const next = { ...previous }
        if (mutation.operation === 'unset') delete next[mutation.key]
        else next[mutation.key] = result.value as Config[K]
        return next
      })
      if (
        mutation.operation === 'set' &&
        mutation.key === 'session.enableAnonymousLogins'
      ) {
        queryClient.setQueryData(configBootstrapQuery.queryKey, {
          'session.enableAnonymousLogins': result.value as boolean,
        } satisfies ConfigBootstrap)
      }

      return result
    },
    [queryClient],
  )
}

export default function useConfig<K extends ConfigKey>(
  key: K,
): [Config[K] | undefined, (value: Config[K]) => Promise<void>] {
  const { data } = useConfigQuery()
  const mutateConfig = useConfigMutation()

  const updateConfig = useCallback(
    async (value: Config[K]) => {
      await mutateConfig({ operation: 'set', key, value })
    },
    [key, mutateConfig],
  )

  return [data?.[key], updateConfig] as const
}
