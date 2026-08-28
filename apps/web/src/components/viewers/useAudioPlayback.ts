import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '~/lib/apiFetch'
import { type PlayStatus, savePlayState } from '~/lib/playState'
import type { QueueItem } from '~/store/audioStore'
import { useAudioStore } from '~/store/audioStore'
import { endedPlaybackAction, normalizeMediaTime } from './audioPlayerUtils'

const PLAY_STATE_INTERVAL_MS = 10_000

export default function useAudioPlayback(currentTrack: QueueItem | null) {
  const playing = useAudioStore((state) => state.playing)
  const volume = useAudioStore((state) => state.volume)
  const repeat = useAudioStore((state) => state.repeat)
  const playNext = useAudioStore((state) => state.playNext)
  const setPlaying = useAudioStore((state) => state.setPlaying)

  const audioRef = useRef<HTMLAudioElement>(null)
  const loadedTrackIdRef = useRef<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const trackId = currentTrack?.id ?? null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      if (!trackId) loadedTrackIdRef.current = null
      return
    }

    if (loadedTrackIdRef.current !== trackId) {
      loadedTrackIdRef.current = trackId
      audio.src = trackId
        ? apiUrl(`/api/media/${trackId}/stream?client=web`)
        : ''
      audio.load()
      setCurrentTime(0)
      setDuration(0)
    }

    if (!trackId || !playing) {
      audio.pause()
      return
    }

    void audio.play().catch(() => setPlaying(false))
  }, [playing, setPlaying, trackId])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  useEffect(() => {
    if (!trackId) return
    const audio = audioRef.current
    if (!audio) return

    const report = (status: PlayStatus) => {
      savePlayState(trackId, audio.currentTime, audio.duration, status)
    }
    const handlePlay = () => report('playing')
    const handlePause = () => {
      if (!audio.ended) report('stopped')
    }
    const handleEnded = () => report('completed')

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    const interval = setInterval(() => {
      if (!audio.paused) report('playing')
    }, PLAY_STATE_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      if (!audio.ended && audio.currentTime > 0) report('stopped')
    }
  }, [trackId])

  function handleTimeUpdate() {
    setCurrentTime(normalizeMediaTime(audioRef.current?.currentTime ?? 0))
  }

  function handleLoadedMetadata() {
    setDuration(normalizeMediaTime(audioRef.current?.duration ?? 0))
  }

  function handleEnded() {
    const audio = audioRef.current
    if (!audio) return

    if (endedPlaybackAction(repeat) === 'restart') {
      audio.currentTime = 0
      setCurrentTime(0)
      void audio.play().catch(() => setPlaying(false))
      return
    }

    playNext()
  }

  function seek(time: number) {
    const nextTime = Math.min(normalizeMediaTime(time), duration)
    setCurrentTime(nextTime)
    if (audioRef.current) audioRef.current.currentTime = nextTime
  }

  return {
    audioRef,
    currentTime,
    duration,
    handleEnded,
    handleLoadedMetadata,
    handleTimeUpdate,
    seek,
  }
}
