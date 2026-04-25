import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import type { QueueItem } from '~/store/audioStore'
import { useAudioStore } from '~/store/audioStore'
import styles from './AudioPlayer.module.css'

export default function AudioPlayer() {
  const queue = useAudioStore((s) => s.queue)
  const currentIndex = useAudioStore((s) => s.currentIndex)
  const playing = useAudioStore((s) => s.playing)
  const volume = useAudioStore((s) => s.volume)
  const shuffle = useAudioStore((s) => s.shuffle)
  const repeat = useAudioStore((s) => s.repeat)
  const playNext = useAudioStore((s) => s.playNext)
  const playPrev = useAudioStore((s) => s.playPrev)
  const setPlaying = useAudioStore((s) => s.setPlaying)
  const setVolume = useAudioStore((s) => s.setVolume)
  const toggleShuffle = useAudioStore((s) => s.toggleShuffle)
  const toggleRepeat = useAudioStore((s) => s.toggleRepeat)
  const playAtIndex = useAudioStore((s) => s.playAtIndex)
  const removeFromQueue = useAudioStore((s) => s.removeFromQueue)
  const clearQueue = useAudioStore((s) => s.clearQueue)
  const moveUp = useAudioStore((s) => s.moveUp)
  const moveDown = useAudioStore((s) => s.moveDown)

  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showQueue, setShowQueue] = useState(false)

  const currentTrack: QueueItem | null = queue[currentIndex] ?? null

  // Keep a ref to playing so the track-load effect doesn't re-run on play/pause
  const playingRef = useRef(playing)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // Sync playing state with audio element
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.play().catch(() => setPlaying(false))
    } else {
      audio.pause()
    }
  }, [playing, setPlaying])

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // When track changes, load and play
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (currentTrack) {
      audio.src = `/api/v1/media/${currentTrack.id}/stream`
      audio.load()
      if (playingRef.current) audio.play().catch(() => setPlaying(false))
    } else {
      audio.src = ''
    }
    setCurrentTime(0)
    setDuration(0)
  }, [currentTrack, setPlaying])

  // Report progress every 10 seconds while playing
  useEffect(() => {
    if (!currentTrack) return
    const audio = audioRef.current
    if (!audio) return

    const trackId = currentTrack.id
    const interval = setInterval(() => {
      if (!audio.paused && audio.duration > 0) {
        const completed = audio.currentTime >= audio.duration - 1
        apiFetch(`/api/v1/media/${trackId}/progress`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position: Math.floor(audio.currentTime),
            duration: Math.floor(audio.duration),
            completed,
          }),
        }).catch(() => {
          // best-effort save
        })
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [currentTrack])

  if (queue.length === 0) return null

  function handleTimeUpdate() {
    setCurrentTime(audioRef.current?.currentTime ?? 0)
  }

  function handleLoadedMetadata() {
    setDuration(audioRef.current?.duration ?? 0)
  }

  function handleEnded() {
    playNext()
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value)
    setCurrentTime(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }

  function formatTime(s: number): string {
    if (!Number.isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const repeatLabel = repeat === 'none' ? '↺' : repeat === 'all' ? '↺' : '↺¹'
  const repeatTitle =
    repeat === 'none'
      ? 'Repeat: off'
      : repeat === 'all'
        ? 'Repeat: all'
        : 'Repeat: one'

  return (
    <div className={styles.bar ?? ''}>
      {/* biome-ignore lint/a11y/useMediaCaption: audio player — captions not applicable for music */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Queue panel */}
      {showQueue && (
        <div className={styles.queuePanel ?? ''}>
          <div className={styles.queueHeader ?? ''}>
            <span className={styles.queueTitle ?? ''}>
              Queue ({queue.length})
            </span>
            <button
              type="button"
              className={styles.queueClear ?? ''}
              onClick={clearQueue}
              title="Clear queue"
            >
              Clear all
            </button>
          </div>
          <ul className={styles.queueList ?? ''}>
            {queue.map((item, i) => (
              <li
                key={item.id}
                className={`${styles.queueItem ?? ''}${i === currentIndex ? ` ${styles.queueItemActive ?? ''}` : ''}`}
              >
                <button
                  type="button"
                  className={styles.queueItemPlay ?? ''}
                  onClick={() => playAtIndex(i)}
                  title="Play this track"
                >
                  {i === currentIndex && playing ? '▶' : '▷'}
                </button>
                <span className={styles.queueItemTitle ?? ''}>
                  {item.title}
                </span>
                <div className={styles.queueItemActions ?? ''}>
                  <button
                    type="button"
                    className={styles.queueMoveBtn ?? ''}
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.queueMoveBtn ?? ''}
                    onClick={() => moveDown(i)}
                    disabled={i === queue.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.queueRemoveBtn ?? ''}
                    onClick={() => removeFromQueue(i)}
                    title="Remove from queue"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Player bar */}
      <div className={styles.controls ?? ''}>
        {/* Track info */}
        <div className={styles.trackInfo ?? ''}>
          <span className={styles.trackTitle ?? ''}>
            {currentTrack?.title ?? '—'}
          </span>
          <span className={styles.trackType ?? ''}>
            {currentTrack?.mimeType?.split('/')[1]?.toUpperCase() ?? ''}
          </span>
        </div>

        {/* Playback controls */}
        <div className={styles.playbackControls ?? ''}>
          <button
            type="button"
            className={`${styles.iconBtn ?? ''}${shuffle ? ` ${styles.active ?? ''}` : ''}`}
            onClick={toggleShuffle}
            title={shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          >
            ⇄
          </button>
          <button
            type="button"
            className={styles.iconBtn ?? ''}
            onClick={playPrev}
            title="Previous"
            disabled={queue.length === 0}
          >
            ⏮
          </button>
          <button
            type="button"
            className={styles.playBtn ?? ''}
            onClick={() => setPlaying(!playing)}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className={styles.iconBtn ?? ''}
            onClick={playNext}
            title="Next"
            disabled={queue.length === 0}
          >
            ⏭
          </button>
          <button
            type="button"
            className={`${styles.iconBtn ?? ''}${repeat !== 'none' ? ` ${styles.active ?? ''}` : ''}`}
            onClick={toggleRepeat}
            title={repeatTitle}
          >
            {repeatLabel}
          </button>
        </div>

        {/* Seek bar */}
        <div className={styles.seekArea ?? ''}>
          <span className={styles.timeLabel ?? ''}>
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            className={styles.seekBar ?? ''}
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
          />
          <span className={styles.timeLabel ?? ''}>{formatTime(duration)}</span>
        </div>

        {/* Volume + queue toggle */}
        <div className={styles.rightControls ?? ''}>
          <span className={styles.volIcon ?? ''}>🔊</span>
          <input
            type="range"
            className={styles.volumeBar ?? ''}
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            title="Volume"
          />
          <button
            type="button"
            className={`${styles.iconBtn ?? ''}${showQueue ? ` ${styles.active ?? ''}` : ''}`}
            onClick={() => setShowQueue(!showQueue)}
            title="Toggle queue"
          >
            ☰ {queue.length}
          </button>
        </div>
      </div>
    </div>
  )
}
