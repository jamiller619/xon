import type { Config, ConfigKey } from '@xon/shared'
import writeAtomic from 'write-file-atomic'

export default class ConfigStore {
  #data: Config
  #filePath: string

  constructor(filePath: string, savedConfig: Config) {
    this.#data = savedConfig
    this.#filePath = filePath
  }

  getStore(): Config {
    return {
      ...this.#data,
    }
  }

  async setStore(data: Partial<Config>): Promise<void> {
    Object.assign(this.#data, data)

    await this.#write()
  }

  get<K extends ConfigKey>(key: K): Config[K] {
    return this.#data[key]
  }

  async set<K extends ConfigKey>(key: K, value?: Config[K]): Promise<void> {
    Object.assign(this.#data, { [key]: value })

    await this.#write()
  }

  async #write() {
    await writeAtomic(this.#filePath, JSON.stringify(this.#data, null, 2))
  }
}
