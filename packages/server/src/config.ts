import fsp from 'node:fs/promises'
import path from 'node:path'
import envPaths from 'env-paths'
import { z } from 'zod'
import ConfigStore, { type Config } from './config/ConfigStore.ts'
import schema from './config/schema.json' with { type: 'json' }

export type { Config, ConfigStore }

export const configSchema = z.fromJSONSchema(
  schema as z.core.JSONSchema.JSONSchema,
)

const paths = envPaths('xon', {
  suffix: '',
})

const configPath =
  process.env.XON_CONFIG_FILE ?? path.join(paths.data, 'config', 'config.json')

await fsp.mkdir(path.dirname(configPath), { recursive: true })

const data = await getConfig()

export default new ConfigStore(configPath, data)

async function getConfig() {
  try {
    const data = await fsp.readFile(configPath, 'utf-8')

    return JSON.parse(data)
  } catch {
    const data = createDefaultsFromSchema(schema as JsonSchema)

    await fsp.writeFile(configPath, JSON.stringify(data))

    return data
  }
}

/**
 * Creates an object from a JSON schema where:
 * - properties with a `default` use that value
 * - all other properties are `undefined`
 */
function createDefaultsFromSchema(json: JsonSchema): Config {
  if (json.type !== 'object' || !json.properties) {
    return {} as unknown as Config
  }

  const result: Record<string, unknown> = {}

  for (const [key, property] of Object.entries(json.properties)) {
    result[key] = getDefaultValue(property)
  }

  const config: Config = result as unknown as Config

  config['appdata.path'] = paths.data
  config['appdata.cachePath'] = path.join(paths.data, 'cache')
  config['appdata.logsPath'] = path.join(paths.data, 'logs')
  config['appdata.dbPath'] = path.join(paths.data, 'database')
  config['appdata.pluginsPath'] = path.join(paths.data, 'plugins')

  return config
}

function getDefaultValue(json: JsonSchema): unknown {
  // Explicit default always wins
  if ('default' in json) {
    return json.default
  }

  // Handle nested object schemas
  if (json.type === 'object' && json.properties) {
    return createDefaultsFromSchema(json)
  }

  // Handle arrays
  if (json.type === 'array') {
    return undefined
  }

  // Handle oneOf
  if (json.oneOf?.length) {
    const withDefault = json.oneOf.find((s) => 'default' in s)

    if (withDefault) {
      return withDefault.default
    }
  }

  return undefined
}

type JsonSchema = {
  type?: string
  default?: unknown
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  oneOf?: JsonSchema[]
}
