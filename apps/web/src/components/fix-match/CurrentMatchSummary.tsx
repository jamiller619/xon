import type { MediaItem } from '@xon/shared'
import { Badge, Flex } from '@xon/ui'
import { thumbnailUrl } from '~/lib/apiFetch'
import styles from './FixMatchDialog.module.css'

export default function CurrentMatchSummary({ item }: { item: MediaItem }) {
  const poster = thumbnailUrl(item, 'medium')

  return (
    <Flex gap="3" align="center" className={styles.currentMatch}>
      <div className={styles.currentPoster}>
        {poster ? (
          <img src={poster} alt="" />
        ) : (
          <span aria-hidden="true">▶</span>
        )}
      </div>
      <div className={styles.currentDetails}>
        <strong>{item.title}</strong>
        <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
          {item.metadata.year != null && (
            <Badge size="small">{String(item.metadata.year)}</Badge>
          )}
          <span>{item.filePath}</span>
        </Flex>
      </div>
    </Flex>
  )
}
