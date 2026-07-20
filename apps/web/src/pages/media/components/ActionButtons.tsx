import {
  AddCircle20Filled as AddIcon,
  Edit20Filled as EditIcon,
  Heart24Filled as HeartIcon,
  Heart24Regular as HeartStrokeIcon,
  Play20Filled as PlayIcon,
} from '@fluentui/react-icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Button, Flex } from '@xon/ui'

type ActionButtonsProps = {
  item: MediaItem
}

export default function ActionButtons({ item }: ActionButtonsProps) {
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
    <Flex dir="row" gap="3">
      <Button
        variant="primary"
        size="large"
        disabled={item.drmProtected}
        title={
          item.drmProtected ? 'Playback unavailable — DRM protected' : 'Play'
        }
        // onClick={() => setShowPlayer(true)}
      >
        <PlayIcon /> <span>Play</span>
      </Button>
      <Button
        title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
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
    </Flex>
  )
}
