import {
  isHLSProvider,
  MediaPlayer,
  type MediaPlayerInstance,
  MediaProvider,
  Track,
} from '@vidstack/react'
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default'
import type { MediaItem, PlaybackClient } from '@xon/shared'
import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiUrl } from '~/lib/apiFetch'
import { savePlayState } from '~/lib/playState'
import { useAuthStore } from '~/store/authStore'
import styles from '../Media.module.css'

import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'

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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const playerRef = useRef<MediaPlayerInstance>(null)
  const lastPositionRef = useRef(0)
  const completedRef = useRef(false)
  const [subtitleTracks, setSubtitleTracks] = useState<ExternalSubtitleTrack[]>(
    [],
  )
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    dialog.showModal()
    return () => dialog.close()
  }, [])

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
    <dialog
      ref={dialogRef}
      className={styles.playerDialog}
      aria-label={`Playing ${item.title}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div className={styles.playerShell}>
        <div className={styles.playerHeader}>
          <p className={styles.playerTitle}>{item.title}</p>
          <button
            type="button"
            className={styles.closePlayerButton}
            onClick={onClose}
            aria-label="Close video player"
            title="Close (Esc)"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
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
          <DefaultVideoLayout icons={defaultLayoutIcons} />
        </MediaPlayer>
        {playbackError && (
          <div className={styles.playbackError} role="alert">
            <strong>Playback failed.</strong>
            <span>{playbackError}</span>
          </div>
        )}
      </div>
    </dialog>
  )
}
