import {
  TextBulletListAdd20Regular as AddToQueueIcon,
  Album24Regular as AlbumIcon,
  Play20Filled as PlayIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Button, Skeleton } from '@xon/ui'
import ArtworkImage from '~/components/ArtworkImage'
import { apiFetch, thumbnailUrl } from '~/lib/apiFetch'
import { formatDuration, formatDurationSeconds } from '~/lib/utils'
import { useAudioStore } from '~/store/audioStore'
import styles from './AlbumTrackList.module.css'
import type { MusicAlbumDetail, MusicGroup } from './musicTypes'

type AlbumTrackListProps = {
  libraryId: string
  album: MusicGroup
}

function metadataText(item: MediaItem, key: string): string | undefined {
  const value = item.fileMetadata[key] ?? item.metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function metadataNumber(item: MediaItem, key: string): number | undefined {
  const value = item.fileMetadata[key] ?? item.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function queueItem(track: MediaItem) {
  return {
    id: track.id,
    title: track.title,
    mimeType: track.mediaType ?? 'audio/mpeg',
  }
}

export default function AlbumTrackList({
  libraryId,
  album,
}: AlbumTrackListProps) {
  const playTrack = useAudioStore((state) => state.playTrack)
  const addToQueue = useAudioStore((state) => state.addToQueue)
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
  const albumDuration = getAlbumDuration(tracks)

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
        <div className={styles.albumInfo}>
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
        </div>
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
            const trackNumber =
              metadataNumber(track, 'trackNumber') ?? index + 1
            const discNumber = metadataNumber(track, 'discNumber')
            const artist = metadataText(track, 'artist')

            return (
              <li className={styles.track} key={track.id}>
                <button
                  type="button"
                  className={styles.trackMain}
                  onClick={() => playTrack(queueItem(track))}
                  aria-label={`Play ${track.title}`}
                >
                  <PlayIcon
                    className={styles.playIcon ?? ''}
                    aria-hidden="true"
                  />
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
                  onClick={() => addToQueue(queueItem(track))}
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
