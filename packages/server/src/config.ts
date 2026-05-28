import fsp from 'node:fs/promises'
import path from 'node:path'
import { loadEnvFile } from 'node:process'
import { parseEnv } from 'node:util'
import { type Config, schema } from '@xon/shared'
import envPaths from 'env-paths'
import { findUp } from 'find-up-simple'
import { z } from 'zod'
import ConfigStore from './config/ConfigStore.ts'

export type { Config, ConfigStore }

export const configSchema = z.fromJSONSchema(
  schema as z.core.JSONSchema.JSONSchema,
)

const paths = envPaths('xon', {
  suffix: '',
})

console.log('Looking for .env file...')

const envFile = await findUp('.env')

let startingConfig: Partial<Config> = {}

if (envFile) {
  console.log('Found .env file:', envFile)

  loadEnvFile(envFile)

  startingConfig = (await parseEnvFile(envFile)) ?? {}
} else {
  console.log('No .env file found')
}

const configFilePath =
  process.env.XON_CONFIG_FILE ?? path.join(paths.data, 'config.json')

await fsp.mkdir(path.dirname(configFilePath), { recursive: true })

const data = {
  ...startingConfig,
  ...(await getConfig()),
}

export default new ConfigStore(configFilePath, data)

export * from './config/config.router.ts'

async function getConfig(): Promise<Config> {
  try {
    const data = await fsp.readFile(configFilePath, 'utf-8')

    return JSON.parse(data)
  } catch {
    const data = createDefaultsFromSchema(schema as JsonSchema)

    await fsp.writeFile(configFilePath, JSON.stringify(data))

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

async function parseEnvFile(
  envFile: string,
): Promise<Partial<Config> | undefined> {
  try {
    const data = await fsp.readFile(envFile, 'utf-8')
    const raw = data.split('\n').reduce((acc, line) => {
      const parsed = parseEnv(line)

      if (parsed) {
        return { ...(acc ?? {}), ...parsed }
      }

      return acc
    }, {})

    const parsed = configSchema.safeParse(raw)

    if (!parsed.success) {
      console.log('Failed to parse .env file')

      return
    }

    console.log('Successfully parsed .env file')

    return parsed.data as Partial<Config>
  } catch (error) {
    console.log('Failed to parse .env file', error)
  }
}

type JsonSchema = {
  type?: string
  default?: unknown
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  oneOf?: JsonSchema[]
}
