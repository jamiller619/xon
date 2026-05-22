export { default as schema } from './config/config.schema.json' with {
  type: 'json',
}

import type { XonConfigSchema } from './config/schema.js'

// export * from './config/schema.js'

export type ConfigKey = keyof XonConfigSchema
export type Config = XonConfigSchema
