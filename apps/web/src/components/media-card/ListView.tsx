import type { MediaItem } from '@xon/shared'
import { Badge } from '@xon/ui'
import type { ComponentPropsWithRef } from 'react'
import { Link } from 'react-router-dom'
import { thumbnailUrl } from '~/lib/apiFetch'
import { formatBytes, formatDuration, formatYear, mediaPath } from '~/lib/utils'
import styles from './MediaCard.module.css'
import ProgressBar from './ProgressBar'

type ListViewProps = {
  item: MediaItem
  handlePlay: (e: React.MouseEvent) => void
  handleAddToQueue: (e: React.MouseEvent) => void
  onOpen?: ((item: MediaItem) => void) | undefined
  progress?: number | undefined
  rowProps?: ComponentPropsWithRef<'tr'> & { 'data-index'?: number }
}

export default function ListView({
  item,
  handlePlay,
  handleAddToQueue,
  onOpen,
  progress,
  rowProps,
}: ListViewProps) {
  const isAudio = item.mediaType?.startsWith('audio/') ?? false
  const posterSrc = thumbnailUrl(item, 'small')
  const link = mediaPath(item)

  function handleOpen(e: React.MouseEvent) {
    if (!onOpen) return
    e.preventDefault()
    onOpen(item)
  }

  return (
    <tr {...rowProps}>
      <td className={styles.listThumbCell}>
        <Link
          to={link}
          onClick={handleOpen}
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
          {progress !== undefined && (
            <ProgressBar title={item.title} value={progress} />
          )}
        </Link>
      </td>
      <td className={styles.listTitleCell}>
        <Link to={link} className={styles.listTitle} onClick={handleOpen}>
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
      <td className={styles.listActionsCell}>
        {isAudio && (
          <>
            <button
              type="button"
              className={styles.listPlayBtn}
              onClick={handlePlay}
              aria-label={`Play ${item.title}`}
              title="Play"
            >
              ▶
            </button>
            <button
              type="button"
              className={styles.listQueueBtn}
              onClick={handleAddToQueue}
              aria-label={`Add ${item.title} to queue`}
              title="Add to queue"
            >
              +
            </button>
          </>
        )}
      </td>
    </tr>
  )
}
