import type { MediaItem } from '@xon/shared'
import { Badge } from '@xon/ui'
import { Link } from 'react-router-dom'
import { thumbnailUrl } from '~/lib/apiFetch'
import { formatBytes, formatDuration, formatYear } from '~/lib/utils'
import styles from './MediaCard.module.css'

type ListViewProps = {
  item: MediaItem
  handlePlay: (e: React.MouseEvent) => void
  handleAddToQueue: (e: React.MouseEvent) => void
  selectMode?: boolean | undefined
  selected?: boolean | undefined
  onToggleSelect?: ((id: string) => void) | undefined
}

export default function ListView({
  item,
  handlePlay,
  handleAddToQueue,
}: ListViewProps) {
  const isAudio = item.mediaType?.startsWith('audio/') ?? false
  const posterSrc = thumbnailUrl(item, 'small')

  return (
    <tr className={`${styles.listRow}`}>
      <td className={styles.listThumbCell}>
        <Link
          to={`/media/${item.id}`}
          className={`${styles.listThumbLink} ${item.drmProtected ? styles.listThumbDrm : ''}`}
        >
          {posterSrc ? (
            <img
              src={posterSrc}
              alt=""
              loading="lazy"
              className={styles.listThumbImg}
            />
          ) : (
            <div className={styles.listThumbPlaceholder}>
              {isAudio ? '♪' : '▶'}
            </div>
          )}
          {item.drmProtected && <span className={styles.listDrmBadge}>🔒</span>}
        </Link>
      </td>
      <td className={styles.listTitleCell}>
        <Link to={`/media/${item.id}`} className={styles.listTitle}>
          {item.title}
        </Link>
        {item.mediaType && (
          <Badge size="small">
            {item.mediaType.split('/')[1] ?? item.mediaType}
          </Badge>
        )}
      </td>
      <td className={styles.listCell}>{formatDuration(item) ?? '—'}</td>
      <td className={styles.listCell}>{formatBytes(item)}</td>
      <td>{formatYear(item)}</td>
      <td className={styles.listCell}>
        {new Date(item.createdAt).toLocaleString()}
      </td>
      {isAudio && (
        <td className={styles.listCell}>
          <button
            type="button"
            className={styles.listPlayBtn}
            onClick={handlePlay}
          >
            ▶
          </button>
          <button
            type="button"
            className={styles.listQueueBtn}
            onClick={handleAddToQueue}
            title="Add to queue"
          >
            +
          </button>
        </td>
      )}
    </tr>
  )
}
