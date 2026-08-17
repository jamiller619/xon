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
import type { Library, MediaItem } from '@xon/shared'
import {
  Button,
  Card,
  ContextMenu,
  type ContextMenuItem,
  Dialog,
} from '@xon/ui'
import { type ComponentPropsWithRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRefreshMetadataConfirmation } from '~/components/confirmation/ConfirmationProvider'
import useMetadata from '~/hooks/useMetadata'
import usePlayState from '~/hooks/usePlayState'
import { apiFetch, thumbnailUrl } from '~/lib/apiFetch'
import { mediaPath } from '~/lib/utils'
import { useAudioStore } from '~/store/audioStore'
import ArtworkImage from '../ArtworkImage'
import EditImages from '../EditImages'
import FixMatchDialog from '../fix-match/FixMatchDialog'
import ListView from './ListView'
import styles from './MediaCard.module.css'
import { startMediaViewTransition } from './mediaViewTransition'
import ProgressBar, { getProgress } from './ProgressBar'

interface MediaCardProps {
  item: MediaItem
  library?: Library | undefined
  listView?: boolean
  imageOnly?: boolean
  thumbAspectRatio?: string
  onOpen?: (item: MediaItem, e?: React.MouseEvent | undefined) => void
  isFavorited?: boolean
  onToggleFavorite?: (id: string, currentlyFavorited: boolean) => void
  listRowProps?: ComponentPropsWithRef<'tr'> & { 'data-index'?: number }
}

export default function MediaCard({
  item,
  library,
  listView,
  imageOnly = false,
  thumbAspectRatio,
  onOpen,
  isFavorited,
  onToggleFavorite,
  listRowProps,
}: MediaCardProps) {
  const confirmRefresh = useRefreshMetadataConfirmation()
  const navigate = useNavigate()
  const playTrack = useAudioStore((s) => s.playTrack)
  const addToQueue = useAudioStore((s) => s.addToQueue)
  const [editImagesOpen, setEditImagesOpen] = useState(false)
  const [fixMatchOpen, setFixMatchOpen] = useState(false)
  const playState = usePlayState(item.id)
  const isAudio = item.mediaType?.startsWith('audio/') ?? false
  const posterSrc = thumbnailUrl(item, 'medium')
  const link = mediaPath(item)
  const progress = getProgress(playState?.position, playState?.duration)
  const metadata = useMetadata(item, 'year')

  function handleOpen(e: React.MouseEvent<HTMLElement>) {
    if (onOpen) {
      e.preventDefault()
      onOpen(item, e)
      return
    }

    startMediaViewTransition({
      event: e,
      item,
      navigate,
      state: { ...item, library },
      to: link,
    })
  }

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

  function handleRefreshMetadata() {
    confirmRefresh(() =>
      apiFetch(`/api/libraries/${item.libraryId}/scan/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaItemId: item.id }),
      }),
    )
  }

  if (listView) {
    return (
      <ListView
        item={item}
        handleAddToQueue={handleAddToQueue}
        handleOpen={handleOpen}
        handlePlay={handlePlay}
        progress={playState ? progress : undefined}
        {...(listRowProps ? { rowProps: listRowProps } : {})}
      />
    )
  }

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
      onClick: handleRefreshMetadata,
    },
    {
      label: 'Delete',
      icon: <DeleteIcon />,
    },
  ]

  return (
    <>
      <ContextMenu items={contextMenuItems}>
        <Card
          as={Link}
          to={link}
          className={styles.card}
          onClick={handleOpen}
          state={{
            ...item,
            library,
          }}
        >
          <Card.Thumb aspectRatio={thumbAspectRatio}>
            <ArtworkImage
              src={posterSrc}
              alt={item.title}
              loading="lazy"
              fallback={
                <div className={styles.thumbPlaceholder}>
                  {!imageOnly && <span>{isAudio ? '♪' : '▶'}</span>}
                </div>
              }
            />
            {item.drmProtected && <div className={styles.drmBadge}>🔒</div>}
            {playState && <ProgressBar title={item.title} value={progress} />}
            {onToggleFavorite && (
              <button
                type="button"
                className={styles.favoriteBtn}
                onClick={handleToggleFavorite}
                title={
                  isFavorited ? 'Remove from favorites' : 'Add to favorites'
                }
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
          {!imageOnly && (
            <Card.Info>
              <Card.Title>{item.title}</Card.Title>
              {metadata && <Card.Meta>{metadata}</Card.Meta>}
            </Card.Info>
          )}
        </Card>
      </ContextMenu>
      <Dialog
        open={editImagesOpen}
        onOpenChange={setEditImagesOpen}
        title={`${item.title}: Edit images`}
        headerActions={
          <Button size="small" onClick={handleRefreshMetadata}>
            <RefreshIcon aria-hidden="true" />
            Refresh Metadata
          </Button>
        }
      >
        <EditImages item={item} />
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
