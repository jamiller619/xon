import type { MediaType } from '@xon/shared'
import { BasePlugin } from './BasePlugin.js'
import type {
  MediaProviderConfigSchema,
  MediaProviderFile,
  WatchCallback,
} from './types.js'

export abstract class MediaTypeProviderPlugin extends BasePlugin {
  abstract readonly mediaTypes: MediaType.MainType[]

  onScan(file: MediaProviderFile) {}
}
