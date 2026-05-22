import type { Config, ConfigKey } from '@xon/shared'
import { API_ROUTES } from '~/lib/apiRoutes'

const resp = await fetch(API_ROUTES['config.get'])
const config = (await resp.json()) as Config

async function updateConfig<K extends ConfigKey>(
  key: K,
  value: Config[K],
): Promise<void> {
  await fetch(API_ROUTES['config.set'], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key, value }),
  })
}

export default function useConfig<K extends ConfigKey>(
  key: K,
): [Config[K], typeof updateConfig] {
  return [config[key], updateConfig] as const
}
