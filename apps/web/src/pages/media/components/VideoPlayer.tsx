import {
  isHLSProvider,
  MediaPlayer,
  type MediaPlayerInstance,
  MediaProvider,
  Poster,
  Track,
} from '@vidstack/react'
import type { MediaItem, PlaybackClient } from '@xon/shared'
import { Dialog } from '@xon/ui'
import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiUrl } from '~/lib/apiFetch'
import { savePlayState } from '~/lib/playState'
import { useAudioStore } from '~/store/audioStore'
import { useAuthStore } from '~/store/authStore'
import styles from '../Media.module.css'
import VideoPlayerControls from './VideoPlayerControls'

import '@vidstack/react/player/styles/base.css'
import '@vidstack/react/player/styles/default/captions.css'

type ExternalSubtitleTrack = {
  type: 'external'
  file: string
  language?: string
  label: string
}

type TracksResponse = {
  subtitleTracks?: Array<
    ExternalSubtitleTrack | { type: 'embedded'; index: number }
  >
}

const PLAYBACK_CLIENT = 'web' satisfies PlaybackClient

export default function VideoPlayerDialog({
  item,
  poster,
  onClose,
}: {
  item: MediaItem
  poster: string | undefined
  onClose: () => void
}) {
  const playerRef = useRef<MediaPlayerInstance>(null)
  const lastPositionRef = useRef(0)
  const completedRef = useRef(false)
  const [subtitleTracks, setSubtitleTracks] = useState<ExternalSubtitleTrack[]>(
    [],
  )
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const volume = useAudioStore((state) => state.volume)
  const setVolume = useAudioStore((state) => state.setVolume)

  useEffect(() => {
    const controller = new AbortController()

    apiFetch(`/api/media/${item.id}/tracks`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Subtitle tracks are unavailable')
        return (await response.json()) as TracksResponse
      })
      .then((response) => {
        setSubtitleTracks(
          response.subtitleTracks?.filter(
            (track): track is ExternalSubtitleTrack =>
              track.type === 'external',
          ) ?? [],
        )
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Subtitle discovery is optional and should never block playback.
      })

    return () => controller.abort()
  }, [item.id])

  useEffect(() => {
    lastPositionRef.current = 0
    completedRef.current = false

    const interval = setInterval(() => {
      const player = playerRef.current
      if (!player || player.paused) return
      savePlayState(item.id, player.currentTime, player.duration, 'playing')
    }, 10000)

    return () => {
      clearInterval(interval)
      const player = playerRef.current
      if (player && !completedRef.current && lastPositionRef.current > 0) {
        savePlayState(item.id, player.currentTime, player.duration, 'stopped')
      }
    }
  }, [item.id])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={item.title}
      popupClassName={styles.playerDialog}
      backdropClassName={styles.playerBackdrop}
      headerClassName={styles.playerHeader}
    >
      <div className={styles.playerShell}>
        <MediaPlayer
          ref={playerRef}
          className={styles.videoPlayer}
          title={item.title}
          src={apiUrl(`/api/media/${item.id}/stream?client=${PLAYBACK_CLIENT}`)}
          poster={poster}
          viewType="video"
          streamType="on-demand"
          playsInline
          autoPlay
          load="eager"
          volume={volume}
          keyTarget="document"
          onCanPlay={() => setPlaybackError(null)}
          onPlay={() => {
            const player = playerRef.current
            if (!player) return
            completedRef.current = false
            savePlayState(
              item.id,
              player.currentTime,
              player.duration,
              'playing',
            )
          }}
          onTimeUpdate={(detail) => {
            lastPositionRef.current = detail.currentTime
          }}
          onPause={() => {
            const player = playerRef.current
            if (!player || completedRef.current) return
            savePlayState(
              item.id,
              player.currentTime,
              player.duration,
              'stopped',
            )
          }}
          onVolumeChange={(detail) => setVolume(detail.volume)}
          onEnded={() => {
            const player = playerRef.current
            if (!player) return
            completedRef.current = true
            savePlayState(
              item.id,
              player.currentTime,
              player.duration,
              'completed',
            )
          }}
          onError={(detail) =>
            setPlaybackError(
              detail.message || 'This video could not be played.',
            )
          }
          onProviderChange={(provider) => {
            if (!isHLSProvider(provider)) return

            provider.library = Hls
            provider.config = {
              ...provider.config,
              xhrSetup(xhr: XMLHttpRequest) {
                const token = useAuthStore.getState().accessToken
                if (token)
                  xhr.setRequestHeader('Authorization', `Bearer ${token}`)
              },
            }
          }}
        >
          <MediaProvider>
            {poster && (
              <Poster
                className={styles.videoPoster}
                src={poster}
                alt={`${item.title} poster`}
              />
            )}
            {subtitleTracks.map((track) => (
              <Track
                key={track.file}
                src={apiUrl(
                  `/api/media/${item.id}/subtitle?file=${encodeURIComponent(track.file)}`,
                )}
                kind="subtitles"
                label={track.label}
                lang={track.language}
                type="vtt"
              />
            ))}
          </MediaProvider>
          <VideoPlayerControls title={item.title} mediaType={item.mediaType} />
        </MediaPlayer>
        {playbackError && (
          <div className={styles.playbackError} role="alert">
            <strong>Playback failed.</strong>
            <span>{playbackError}</span>
          </div>
        )}
      </div>
    </Dialog>
  )
}
