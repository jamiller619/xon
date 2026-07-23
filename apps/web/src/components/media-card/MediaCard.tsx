import {
  TextBulletListAddRegular as AddToPlaylistIcon,
  Delete16Regular as DeleteIcon,
  LinkEdit16Regular as FixMatchIcon,
  ImageEdit16Regular as ImageEditIcon,
  TabDesktop16Regular as OpenIcon,
  TabDesktopCopyRegular as OpenInNewTabIcon,
  Play16Regular as PlayIcon,
  ArrowSyncRegular as RefreshIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Card, ContextMenu, type ContextMenuItem, Dialog } from '@xon/ui'
import { type ComponentPropsWithRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRefreshMetadataConfirmation } from '~/components/confirmation/ConfirmationProvider'
import { apiFetch, thumbnailUrl } from '~/lib/apiFetch'
import { mediaPath } from '~/lib/utils'
import { useAudioStore } from '~/store/audioStore'
import EditImages from '../EditImages'
import FixMatchDialog from '../fix-match/FixMatchDialog'
import ListView from './ListView'
import styles from './MediaCard.module.css'

interface MediaCardProps {
  item: MediaItem
  listView?: boolean
  isFavorited?: boolean
  onToggleFavorite?: (id: string, currentlyFavorited: boolean) => void
  listRowProps?: ComponentPropsWithRef<'tr'> & { 'data-index'?: number }
}

export default function MediaCard({
  item,
  listView,
  isFavorited,
  onToggleFavorite,
  listRowProps,
}: MediaCardProps) {
  const confirmRefresh = useRefreshMetadataConfirmation()
  const playTrack = useAudioStore((s) => s.playTrack)
  const addToQueue = useAudioStore((s) => s.addToQueue)
  const [editImagesOpen, setEditImagesOpen] = useState(false)
  const [fixMatchOpen, setFixMatchOpen] = useState(false)
  const isAudio = item.mediaType?.startsWith('audio/') ?? false
  const posterSrc = thumbnailUrl(item, 'medium')
  const link = mediaPath(item)

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
        handleAddToQueue={handleAddToQueue}
        handlePlay={handlePlay}
        {...(listRowProps ? { rowProps: listRowProps } : {})}
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
        {item.drmProtected && <div className={styles.drmBadge}>🔒</div>}
        {onToggleFavorite && (
          <button
            type="button"
            className={styles.favoriteBtn}
            onClick={handleToggleFavorite}
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorited ? '♥' : '♡'}
          </button>
        )}
        {isAudio && (
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

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: 'Open',
      icon: <OpenIcon />,
    },
    {
      label: 'Open in new tab',
      icon: <OpenInNewTabIcon />,
    },
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
      onClick: () => setFixMatchOpen(true),
    },
    {
      label: 'Refresh metadata',
      icon: <RefreshIcon />,
      onClick: () =>
        confirmRefresh(() =>
          apiFetch(`/api/libraries/${item.libraryId}/scan/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaItemId: item.id }),
          }),
        ),
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
      {fixMatchOpen && (
        <FixMatchDialog
          item={item}
          open={fixMatchOpen}
          onOpenChange={setFixMatchOpen}
        />
      )}
    </>
  )
}
