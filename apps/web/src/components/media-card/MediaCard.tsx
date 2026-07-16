import { Play16Regular as PlayIcon } from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { ContextMenu, type ContextMenuItem } from '@xon/ui'
import { Link } from 'react-router-dom'
import { apiUrl } from '~/lib/apiFetch'
import { useAudioStore } from '~/store/audioStore'
import ListView from './ListView'
import styles from './MediaCard.module.css'

interface MediaCardProps {
  item: MediaItem
  listView?: boolean
  isFavorited?: boolean
  onToggleFavorite?: (id: string, currentlyFavorited: boolean) => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

const contextMenuItems: ContextMenuItem[] = [
  {
    label: 'Play',
    icon: <PlayIcon />,
  },
  {
    label: 'Add to playlist',
  },
  {
    label: 'Fix match',
  },
  {
    label: 'Delete',
  },
]

export default function MediaCard({
  item,
  listView,
  isFavorited,
  onToggleFavorite,
  selectMode,
  selected,
  onToggleSelect,
}: MediaCardProps) {
  const playTrack = useAudioStore((s) => s.playTrack)
  const addToQueue = useAudioStore((s) => s.addToQueue)
  const isAudio = item.mediaType?.startsWith('audio/') ?? false
  const link = `/media/${encodeURIComponent(item.title.toLowerCase().replaceAll(' ', '-'))}/${item.id}`

  function handlePlay(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    playTrack({
      id: item.id,
      title: item.title,
      mimeType: item.mediaType ?? 'audio/mpeg',
    })
  }

  function handleAddToQueue(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    addToQueue({
      id: item.id,
      title: item.title,
      mimeType: item.mediaType ?? 'audio/mpeg',
    })
  }

  function handleToggleFavorite(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onToggleFavorite?.(item.id, isFavorited ?? false)
  }

  if (listView) {
    return (
      <ListView
        item={item}
        selectMode={selectMode}
        handleAddToQueue={handleAddToQueue}
        handlePlay={handlePlay}
        onToggleSelect={onToggleSelect}
        selected={selected}
      />
    )
  }

  const cardContent = (
    <>
      <div className={styles.thumb}>
        {item.metadata.images?.poster ? (
          <img
            src={apiUrl(item.metadata.images.poster)}
            alt={item.title}
            loading="lazy"
            className={styles.thumbImg}
          />
        ) : (
          <div className={styles.thumbPlaceholder}>
            <span>{isAudio ? '♪' : '▶'}</span>
          </div>
        )}
        {item.drmProtected && !selectMode && (
          <div className={styles.drmBadge}>🔒</div>
        )}
        {selectMode && (
          <div className={styles.selectOverlay}>
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={() => onToggleSelect?.(item.id)}
              onClick={(e) => e.stopPropagation()}
              className={styles.selectCheckbox}
            />
          </div>
        )}
        {!selectMode && onToggleFavorite && (
          <button
            type="button"
            className={styles.favoriteBtn}
            onClick={handleToggleFavorite}
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorited ? '♥' : '♡'}
          </button>
        )}
        {!selectMode && isAudio && (
          <div className={styles.audioOverlay}>
            <button
              type="button"
              className={styles.overlayPlayBtn}
              onClick={handlePlay}
              title="Play"
            >
              ▶
            </button>
            <button
              type="button"
              className={styles.overlayQueueBtn}
              onClick={handleAddToQueue}
              title="Add to queue"
            >
              +
            </button>
          </div>
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{item.title}</span>
        <div className={styles.meta}>
          <span>{item.metadata.year}</span>
        </div>
      </div>
    </>
  )

  if (selectMode) {
    return (
      <div
        className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
        // onClick={() => onToggleSelect?.(item.id)}
        // onKeyDown={(e) =>
        //   (e.key === 'Enter' || e.key === ' ') && onToggleSelect?.(item.id)
        // }
        // aria-label={`${selected ? 'Deselect' : 'Select'} ${item.title}`}
      >
        {cardContent}
      </div>
    )
  }

  return (
    <ContextMenu items={contextMenuItems}>
      <Link to={link} className={styles.card} state={item}>
        {cardContent}
      </Link>
    </ContextMenu>
  )
}
