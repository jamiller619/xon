import {
  AddCircle20Filled as AddIcon,
  Edit20Filled as EditIcon,
  Heart24Filled as HeartIcon,
  Heart24Regular as HeartStrokeIcon,
  Play20Filled as PlayIcon,
} from '@fluentui/react-icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Button } from '@xon/ui'

type ActionButtonsProps = {
  item: MediaItem
}

export default function ActionButtons({ item }: ActionButtonsProps) {
  const { isVideo, isAudio, isImage } = determineType(item)
  const { data: isFavorited } = useQuery<boolean>({
    queryKey: ['isFavorited', item.id],
    queryFn: async () => {
      const res = await fetch(`/api/media/${item.id}/is-favorited`)

      return res.json()
    },
    initialData: false,
  })

  const { data: isWatchlisted } = useQuery<boolean>({
    queryKey: ['isWatchlisted', item.id],
    queryFn: async () => {
      const res = await fetch(`/api/media/${item.id}/is-watchlisted`)

      return res.json()
    },
    initialData: false,
  })

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/media/${item.id}/toggle-favorite`, {
        method: 'POST',
      })

      return res.json()
    },
    onMutate() {
      return !isFavorited
    },
  })

  const toggleWatchlist = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/media/${item.id}/toggle-watchlist`, {
        method: 'POST',
      })

      return res.json()
    },
    onMutate() {
      return !isWatchlisted
    },
  })

  return (
    <>
      {isImage ? (
        <button
          type="button"
          // className={`${styles.btnPlay} ${item.drmProtected ? styles.btnDisabled : ''}`}
          disabled={item.drmProtected}
          title={
            item.drmProtected
              ? 'Viewing unavailable — DRM protected'
              : 'View image'
          }
          // onClick={() => setShowImageViewer(true)}
        >
          🖼 View
        </button>
      ) : isAudio ? (
        <>
          <Button
            // className={styles.btnPlay}
            variant="primary"
            disabled={item.drmProtected}
            title={
              item.drmProtected
                ? 'Playback unavailable — DRM protected'
                : 'Play'
            }
            // onClick={() => {
            //   if (!item.drmProtected && item.id) {
            //     playTrack({
            //       id: item.id,
            //       title: item.title ?? fileName,
            //       mimeType: item.mimeType,
            //     })
            //   }
            // }}
          >
            ▶ Play
          </Button>
          <button
            type="button"
            // className={styles.btnSecondary}
            disabled={item.drmProtected}
            title="Add to queue"
            // onClick={() => {
            //   if (!item.drmProtected && item.id) {
            //     addToQueue({
            //       id: item.id,
            //       title: item.title ?? fileName,
            //       mimeType: item.mimeType,
            //     })
            //   }
            // }}
          >
            + Queue
          </button>
        </>
      ) : (
        <Button
          variant="primary"
          size="large"
          disabled={item.drmProtected || !isVideo}
          title={
            item.drmProtected
              ? 'Playback unavailable — DRM protected'
              : !isVideo
                ? 'Playback not supported for this media type'
                : 'Play'
          }
          // onClick={() => setShowPlayer(true)}
        >
          <PlayIcon /> <span>Play</span>
        </Button>
      )}
      {/* {isVideo && (
        <Button onClick={startEditing} title="Edit metadata">
          <EditIcon />
        </Button>
      )} */}
      <Button
        title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        // size="large"
        onClick={() => toggleFavorite.mutate()}
      >
        {isFavorited ? <HeartIcon /> : <HeartStrokeIcon />}
      </Button>
      <Button
        title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
        // size="large"
        onClick={() => toggleWatchlist.mutate()}
      >
        {isWatchlisted ? (
          <>
            <EditIcon />
            <span>Watchlisted</span>
          </>
        ) : (
          <>
            <AddIcon />
            <span>Watchlist</span>
          </>
        )}
      </Button>
    </>
  )
}

function determineType(item: MediaItem) {
  const isVideo = item.mimeType?.startsWith('video/')

  if (isVideo)
    return {
      isVideo: true,
      isAudio: false,
      isImage: false,
    }

  const isAudio = item.mimeType?.startsWith('audio/')

  if (isAudio)
    return {
      isVideo: false,
      isAudio: true,
      isImage: false,
    }

  const isImage = item.mimeType?.startsWith('image/')

  if (isImage)
    return {
      isVideo: false,
      isAudio: false,
      isImage: true,
    }

  return {
    isVideo: false,
    isAudio: false,
    isImage: false,
  }
}
