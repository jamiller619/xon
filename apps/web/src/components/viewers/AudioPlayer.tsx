import { Surface } from '@xon/ui'
import { useLayoutEffect, useRef, useState } from 'react'
import type { QueueItem } from '~/store/audioStore'
import { useAudioStore } from '~/store/audioStore'
import styles from './AudioPlayer.module.css'
import AudioPlayerControls from './AudioPlayerControls'
import AudioQueuePanel from './AudioQueuePanel'
import useAudioPlayback from './useAudioPlayback'

export default function AudioPlayer() {
  const queueLength = useAudioStore((state) => state.queue.length)
  const playerRef = useRef<HTMLDivElement>(null)
  const currentTrack = useAudioStore(
    (state): QueueItem | null => state.queue[state.currentIndex] ?? null,
  )
  const [showQueue, setShowQueue] = useState(false)
  const playback = useAudioPlayback(currentTrack)
  const hasQueue = queueLength > 0

  useLayoutEffect(() => {
    if (queueLength === 0) {
      document.documentElement.style.removeProperty('--audio-player-height')
      return
    }

    const player = playerRef.current

    if (!player) return

    const updatePlayerHeight = () => {
      document.documentElement.style.setProperty(
        '--audio-player-height',
        `${player.getBoundingClientRect().height}px`,
      )
    }

    updatePlayerHeight()
    const resizeObserver = new ResizeObserver(updatePlayerHeight)
    resizeObserver.observe(player)

    return () => {
      resizeObserver.disconnect()
      document.documentElement.style.removeProperty('--audio-player-height')
    }
  }, [queueLength])

  if (!hasQueue) return null

  return (
    <div ref={playerRef} className={styles.bar}>
      <Surface transparent className={styles.playerSurface} borderRadius="none">
        {/* biome-ignore lint/a11y/useMediaCaption: captions are not applicable to music playback */}
        <audio
          ref={playback.audioRef}
          onTimeUpdate={playback.handleTimeUpdate}
          onLoadedMetadata={playback.handleLoadedMetadata}
          onEnded={playback.handleEnded}
        />

        {showQueue && <AudioQueuePanel />}

        <AudioPlayerControls
          currentTrack={currentTrack}
          currentTime={playback.currentTime}
          duration={playback.duration}
          showQueue={showQueue}
          onSeek={playback.seek}
          onToggleQueue={() => setShowQueue((visible) => !visible)}
        />
      </Surface>
    </div>
  )
}
