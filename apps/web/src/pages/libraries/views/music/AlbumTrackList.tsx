import {
  TextBulletListAdd20Regular as AddToQueueIcon,
  Album24Regular as AlbumIcon,
  // Play20Filled as PlayIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Button, Flex, Skeleton } from '@xon/ui'
import ArtworkImage from '~/components/ArtworkImage'
import { PauseIcon, PlayIcon, ShuffleIcon } from '~/components/icons/playback'
import { apiFetch, thumbnailUrl } from '~/lib/apiFetch'
import { mediaMetadataText } from '~/lib/mediaMetadata'
import { formatDuration, formatDurationSeconds } from '~/lib/utils'
import { type QueueItem, useAudioStore } from '~/store/audioStore'
import styles from './AlbumTrackList.module.css'
import type { MusicAlbumDetail, MusicGroup } from './musicTypes'

type AlbumTrackListProps = {
  libraryId: string
  album: MusicGroup
}

function metadataNumber(item: MediaItem, key: string): number | undefined {
  const value = item.fileMetadata[key] ?? item.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function queueItem(track: MediaItem, album: MusicGroup) {
  return {
    id: track.id,
    title: track.title,
    artist: mediaMetadataText(track, 'artist') ?? album.artist,
    album: mediaMetadataText(track, 'album') ?? album.title,
    mimeType: track.mediaType ?? 'audio/mpeg',
  }
}

export default function AlbumTrackList({
  libraryId,
  album,
}: AlbumTrackListProps) {
  const queue = useAudioStore((state) => state.queue)
  const currentIndex = useAudioStore((state) => state.currentIndex)
  const currentTrack = queue[currentIndex]
  const clearQueue = useAudioStore((state) => state.clearQueue)
  const playing = useAudioStore((state) => state.playing)
  const playIndex = useAudioStore((state) => state.playAtIndex)
  const playTrack = useAudioStore((state) => state.playTrack)
  const addToQueue = useAudioStore((state) => state.addToQueue)
  const setPlaying = useAudioStore((state) => state.setPlaying)
  const albumQuery = useQuery<MusicAlbumDetail>({
    queryKey: ['music-library', libraryId, 'album', album.id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(
        `/api/libraries/${libraryId}/music/albums/${encodeURIComponent(album.id)}`,
        { signal },
      )
      if (!response.ok) throw new Error('Failed to load album')
      return response.json()
    },
  })
  const detail = albumQuery.data
  const displayAlbum = detail ?? album
  const tracks = detail?.tracks ?? []
  const firstTrack = tracks.at(0)
  const albumDuration = getAlbumDuration(tracks)

  const handleAlbumAddToQueue = () => {
    clearQueue()

    for (const track of tracks) {
      addToQueue(queueItem(track, displayAlbum) as QueueItem)
    }

    playIndex(0)
  }

  return (
    <article className={styles.page}>
      <div className={styles.albumHeader}>
        <div className={styles.artwork}>
          <ArtworkImage
            src={
              displayAlbum.artwork
                ? thumbnailUrl(displayAlbum.artwork, 'large')
                : undefined
            }
            alt={`${displayAlbum.title} album cover`}
            fallback={<AlbumIcon />}
          />
        </div>
        <Flex dir="col" gap="1" className={styles.albumInfo}>
          <p className={styles.eyebrow}>Album</p>
          <h2>{displayAlbum.title}</h2>
          <p className={styles.artist}>
            {displayAlbum.artist ?? 'Unknown Artist'}
          </p>
          <p className={styles.count}>
            {displayAlbum.songCount}{' '}
            {displayAlbum.songCount === 1 ? 'track' : 'tracks'}
            {albumDuration != null && ` · ${albumDuration}`}
          </p>
          <Flex gap="2">
            {firstTrack && (
              <Button.Icon
                variant="primary"
                onClick={() => handleAlbumAddToQueue()}
              >
                <PlayIcon />
              </Button.Icon>
            )}
            <Button.Icon>
              <ShuffleIcon />
            </Button.Icon>
          </Flex>
        </Flex>
      </div>

      {albumQuery.isPending ? (
        <div
          className={styles.loading}
          role="status"
          aria-label="Loading album tracks"
        >
          {Array.from({ length: Math.max(3, album.songCount) }).map(
            (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholders
              <div className={styles.loadingRow} key={index}>
                <Skeleton className={styles.numberSkeleton} />
                <Skeleton className={styles.titleSkeleton} />
                <Skeleton className={styles.durationSkeleton} />
              </div>
            ),
          )}
        </div>
      ) : albumQuery.isError ? (
        <p className={styles.error} role="alert">
          The tracks for this album could not be loaded.
        </p>
      ) : tracks.length === 0 ? (
        <p className={styles.empty}>No tracks were found for this album.</p>
      ) : (
        <ol
          className={styles.trackList}
          aria-label={`${displayAlbum.title} tracks`}
        >
          {tracks.map((track, index) => {
            const isPlaying = currentTrack?.id === track.id && playing
            const trackNumber =
              metadataNumber(track, 'trackNumber') ?? index + 1
            const discNumber = metadataNumber(track, 'discNumber')
            const artist = mediaMetadataText(track, 'artist')

            return (
              <li className={styles.track} key={track.id}>
                <button
                  type="button"
                  className={styles.trackMain}
                  onClick={() => {
                    if (isPlaying) {
                      setPlaying(false)
                    } else {
                      playTrack(queueItem(track, displayAlbum) as QueueItem)
                    }
                  }}
                  aria-label={`Play ${track.title}`}
                >
                  {isPlaying ? (
                    <PauseIcon className={styles.playIcon} />
                  ) : (
                    <PlayIcon className={styles.playIcon} />
                  )}
                  <span className={styles.trackNumber} aria-hidden="true">
                    {discNumber != null && discNumber > 1
                      ? `${discNumber}.${trackNumber}`
                      : trackNumber}
                  </span>
                  <span className={styles.trackText}>
                    <span className={styles.trackTitle}>{track.title}</span>
                    {artist != null && artist !== displayAlbum.artist && (
                      <span className={styles.trackArtist}>{artist}</span>
                    )}
                  </span>
                  <span className={styles.duration}>
                    {formatDuration(track) ?? '—'}
                  </span>
                </button>
                <Button.Icon
                  className={styles.queueButton}
                  variant="ghost"
                  onClick={() =>
                    addToQueue(queueItem(track, displayAlbum) as QueueItem)
                  }
                  aria-label={`Add ${track.title} to queue`}
                >
                  <AddToQueueIcon />
                </Button.Icon>
              </li>
            )
          })}
        </ol>
      )}
    </article>
  )
}

function getAlbumDuration(tracks: MediaItem[]) {
  return formatDurationSeconds(
    tracks.reduce((total, track) => {
      const duration = track.fileMetadata.duration
      return typeof duration === 'number' &&
        Number.isFinite(duration) &&
        duration > 0
        ? total + duration
        : total
    }, 0),
  )
}
