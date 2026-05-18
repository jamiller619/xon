import writeAtomic from 'write-file-atomic'
import type { XonConfigSchema } from './schema.ts'

export type ConfigKey = keyof XonConfigSchema
export type Config = XonConfigSchema

// The electron-store module requires escaping keys that
// contain dots, so this class simply wraps the store to do
// that for us. Now we can do `config.get('some.config.key')`
export default class ConfigStore {
  #data: Config
  #filePath: string

  constructor(filePath: string, savedConfig: Config) {
    this.#data = savedConfig
    this.#filePath = filePath
  }

  get<K extends ConfigKey>(key: K): Config[K] {
    return this.#data[key]
  }

  async set<K extends ConfigKey>(key: K, value?: Config[K]): Promise<void> {
    Object.assign(this.#data, { [key]: value })

    await writeAtomic(this.#filePath, JSON.stringify(this.#data, null, 2))
  }
}
