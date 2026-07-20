import {
  TextBulletListAddRegular as AddToPlaylistIcon,
  Delete16Regular as DeleteIcon,
  LinkEdit16Regular as FixMatchIcon,
  ImageEdit16Regular as ImageEditIcon,
  Play16Regular as PlayIcon,
  ArrowSyncRegular as RefreshIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Card, ContextMenu, type ContextMenuItem, Dialog } from '@xon/ui'
import clsx from 'clsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, thumbnailUrl } from '~/lib/apiFetch'
import { useAudioStore } from '~/store/audioStore'
import EditImages from '../EditImages'
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
  const [editImagesOpen, setEditImagesOpen] = useState(false)
  const isAudio = item.mediaType?.startsWith('audio/') ?? false
  const posterSrc = thumbnailUrl(item, 'medium')
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
      <Card.Thumb>
        {posterSrc ? (
          <img src={posterSrc} alt={item.title} loading="lazy" />
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
      </Card.Thumb>
      <Card.Info>
        <Card.Title>{item.title}</Card.Title>
        <Card.Meta>
          <span>{item.metadata.year}</span>
        </Card.Meta>
      </Card.Info>
    </>
  )

  if (selectMode) {
    return (
      <Card
        className={clsx(styles.card, selected && styles.cardSelected)}
        // onClick={() => onToggleSelect?.(item.id)}
        // onKeyDown={(e) =>
        //   (e.key === 'Enter' || e.key === ' ') && onToggleSelect?.(item.id)
        // }
        // aria-label={`${selected ? 'Deselect' : 'Select'} ${item.title}`}
      >
        {cardContent}
      </Card>
    )
  }

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: 'Play',
      icon: <PlayIcon />,
    },
    {
      label: 'Add to playlist',
      icon: <AddToPlaylistIcon />,
    },
    {
      label: 'Edit images',
      icon: <ImageEditIcon />,
      onClick: () => setEditImagesOpen(true),
    },
    {
      label: 'Fix match',
      icon: <FixMatchIcon />,
    },
    {
      label: 'Refresh metadata',
      icon: <RefreshIcon />,
      onClick: () =>
        apiFetch(`/api/libraries/${item.libraryId}/scan/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaItemId: item.id }),
        }),
    },
    {
      label: 'Delete',
      icon: <DeleteIcon />,
    },
  ]

  return (
    <>
      <ContextMenu items={contextMenuItems}>
        <Card as={Link} to={link} className={styles.card} state={item}>
          {cardContent}
        </Card>
      </ContextMenu>
      <Dialog
        open={editImagesOpen}
        onOpenChange={setEditImagesOpen}
        title={`${item.title}: Edit images`}
      >
        <EditImages images={item.metadata.images} />
      </Dialog>
    </>
  )
}
