import type { MediaItem } from '@xon/shared'
import { Link } from 'react-router-dom'
import { thumbnailUrl } from '~/lib/apiFetch'
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
  selectMode,
  selected,
  onToggleSelect,
}: ListViewProps) {
  const isAudio = item.mimeType?.startsWith('audio/') ?? false
  const posterSrc = thumbnailUrl(item, 'small')

  return (
    <tr
      className={`${styles.listRow} ${selected ? styles.listRowSelected : ''}`}
      onClick={selectMode ? () => onToggleSelect?.(item.id) : undefined}
      onKeyDown={
        selectMode
          ? (e) =>
              (e.key === 'Enter' || e.key === ' ') && onToggleSelect?.(item.id)
          : undefined
      }
      style={selectMode ? { cursor: 'pointer' } : undefined}
    >
      {selectMode && (
        <td className={styles.listCheckCell}>
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onToggleSelect?.(item.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
      )}
      <td className={styles.listThumbCell}>
        {selectMode ? (
          <div
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
            {item.drmProtected && (
              <span className={styles.listDrmBadge}>🔒</span>
            )}
          </div>
        ) : (
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
            {item.drmProtected && (
              <span className={styles.listDrmBadge}>🔒</span>
            )}
          </Link>
        )}
      </td>
      <td className={styles.listTitleCell}>
        {selectMode ? (
          <span className={styles.listTitle}>{item.title}</span>
        ) : (
          <Link to={`/media/${item.id}`} className={styles.listTitle}>
            {item.title}
          </Link>
        )}
        {item.mimeType && (
          <span className={styles.listFileType}>
            {item.mimeType.split('/')[1] ?? item.mimeType}
          </span>
        )}
      </td>
      <td className={styles.listCell}>{item.mimeType ?? '—'}</td>
      <td className={styles.listCell}>{formatBytes(item.fileSize)}</td>
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

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
