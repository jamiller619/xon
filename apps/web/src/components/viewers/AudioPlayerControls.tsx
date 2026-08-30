import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Button, Flex } from '@xon/ui'
import clsx from 'clsx'
import { apiFetch } from '~/lib/apiFetch'
import { mediaMetadataText } from '~/lib/mediaMetadata'
import type { QueueItem } from '~/store/audioStore'
import { useAudioStore } from '~/store/audioStore'
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  RepeatIcon,
  ShuffleIcon,
  SoundIcon,
} from '../icons/playback'
import styles from './AudioPlayer.module.css'
import { formatPlaybackTime } from './audioPlayerUtils'

interface AudioPlayerControlsProps {
  currentTrack: QueueItem | null
  currentTime: number
  duration: number
  showQueue: boolean
  onSeek: (time: number) => void
  onToggleQueue: () => void
}

export function CyclingTrackTitle({
  currentTrack,
}: Pick<AudioPlayerControlsProps, 'currentTrack'>) {
  const title = currentTrack?.title.trim() || '—'
  const artist = currentTrack?.artist?.trim()
  const album = currentTrack?.album?.trim()
  const values = [
    ['track', title],
    ...(artist ? ([['artist', artist]] as const) : []),
    ...(album ? ([['album', album]] as const) : []),
  ]
  const description = [
    title,
    artist ? `by ${artist}` : undefined,
    album ? `from ${album}` : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      key={currentTrack?.id ?? 'empty'}
      className={styles.trackTitle}
      data-cycling={values.length === 3}
      role="status"
      aria-label={currentTrack ? description : 'No track selected'}
    >
      {values.map(([kind, value]) => (
        <span
          key={kind}
          className={styles.trackTitleItem}
          title={value}
          aria-hidden="true"
        >
          {value}
        </span>
      ))}
    </div>
  )
}

export default function AudioPlayerControls({
  currentTrack,
  currentTime,
  duration,
  showQueue,
  onSeek,
  onToggleQueue,
}: AudioPlayerControlsProps) {
  const needsMetadata = Boolean(
    currentTrack &&
      (!currentTrack.artist?.trim() || !currentTrack.album?.trim()),
  )
  const metadataQuery = useQuery<MediaItem>({
    queryKey: ['media', currentTrack?.id],
    enabled: needsMetadata,
    queryFn: async ({ signal }) => {
      if (!currentTrack) throw new Error('No current track')
      const response = await apiFetch(`/api/media/${currentTrack.id}`, {
        signal,
      })
      if (!response.ok) throw new Error('Failed to load track metadata')
      return response.json()
    },
  })
  const resolvedArtist =
    currentTrack?.artist?.trim() ||
    (metadataQuery.data
      ? mediaMetadataText(metadataQuery.data, 'artist')
      : undefined)
  const resolvedAlbum =
    currentTrack?.album?.trim() ||
    (metadataQuery.data
      ? mediaMetadataText(metadataQuery.data, 'album')
      : undefined)
  const resolvedTrack = currentTrack
    ? {
        ...currentTrack,
        ...(resolvedArtist ? { artist: resolvedArtist } : {}),
        ...(resolvedAlbum ? { album: resolvedAlbum } : {}),
      }
    : null
  const queueLength = useAudioStore((state) => state.queue.length)
  const playing = useAudioStore((state) => state.playing)
  const volume = useAudioStore((state) => state.volume)
  const shuffle = useAudioStore((state) => state.shuffle)
  const repeat = useAudioStore((state) => state.repeat)
  const playNext = useAudioStore((state) => state.playNext)
  const playPrev = useAudioStore((state) => state.playPrev)
  const setPlaying = useAudioStore((state) => state.setPlaying)
  const setVolume = useAudioStore((state) => state.setVolume)
  const toggleShuffle = useAudioStore((state) => state.toggleShuffle)
  const toggleRepeat = useAudioStore((state) => state.toggleRepeat)

  const repeatTitle =
    repeat === 'none'
      ? 'Repeat: off'
      : repeat === 'all'
        ? 'Repeat: all'
        : 'Repeat: one'

  return (
    <Flex className={styles.controls} gap="2" align="center">
      <Flex className={styles.trackInfo} dir="col">
        <CyclingTrackTitle currentTrack={resolvedTrack} />
        <span className={styles.trackType}>
          {currentTrack?.mimeType?.split('/')[1]?.toUpperCase() ?? ''}
        </span>
      </Flex>

      <Flex align="center">
        <Button.Icon
          className={clsx(shuffle && styles.buttonActive)}
          onClick={toggleShuffle}
          title={shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          aria-label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
          variant="ghost"
        >
          <ShuffleIcon />
        </Button.Icon>
        <Button.Icon
          onClick={playPrev}
          title="Previous"
          aria-label="Previous track"
          disabled={queueLength === 0}
          variant="ghost"
        >
          <PreviousIcon />
        </Button.Icon>
        <Button.Icon
          className={styles.playButton}
          onClick={() => setPlaying(!playing)}
          title={playing ? 'Pause' : 'Play'}
          aria-label={playing ? 'Pause' : 'Play'}
          variant="primary"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button.Icon>
        <Button.Icon
          onClick={playNext}
          title="Next"
          aria-label="Next track"
          disabled={queueLength === 0}
          variant="ghost"
        >
          <NextIcon />
        </Button.Icon>
        <Button.Icon
          className={clsx(repeat !== 'none' && styles.active)}
          onClick={toggleRepeat}
          title={repeatTitle}
          aria-label={repeatTitle}
          variant="ghost"
        >
          <RepeatIcon />
        </Button.Icon>
      </Flex>

      <Flex gap="2" className={styles.seekArea} align="center">
        <span className={styles.timeLabel}>
          {formatPlaybackTime(currentTime)}
        </span>
        <input
          type="range"
          className={styles.seekBar}
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(currentTime, duration || 1)}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Playback position"
        />
        <span className={styles.timeLabel}>{formatPlaybackTime(duration)}</span>
      </Flex>

      <Flex align="center" gap="1">
        <SoundIcon volume={volume} />
        <input
          type="range"
          className={styles.volumeBar}
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="Volume"
        />
      </Flex>
      <Button
        className={clsx(styles.iconBtn, showQueue && styles.active)}
        onClick={onToggleQueue}
        title={showQueue ? 'Hide queue' : 'Show queue'}
        aria-label={showQueue ? 'Hide queue' : 'Show queue'}
      >
        <span aria-hidden="true">☰</span> {queueLength}
      </Button>
    </Flex>
  )
}
