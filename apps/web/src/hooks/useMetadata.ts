import type { MediaItem } from '@xon/shared'
import { formatMetadata, type MetadataKey } from '~/lib/mediaMetadata'

/**
 * Component-friendly facade for the shared, pure metadata formatter.
 * The formatter remains available to non-React UI code in `lib/mediaMetadata`.
 */
export default function useMetadata(
  item: MediaItem | undefined,
  ...keys: MetadataKey[]
): string | undefined {
  return formatMetadata(item, keys)
}
