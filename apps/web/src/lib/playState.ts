import type { MediaPlayProgress } from '@xon/shared'
import { apiFetch } from './apiFetch'
import { PLAY_PROGRESS_QUERY_KEY, queryClient } from './queryClient'

export type PlayStatus = 'playing' | 'stopped' | 'completed'

export function savePlayState(
  mediaId: string,
  position: number,
  duration: number,
  status: PlayStatus,
): void {
  const body: {
    position: number
    duration?: number
    status: PlayStatus
  } = {
    position: Math.max(0, Math.floor(Number.isFinite(position) ? position : 0)),
    status,
  }

  if (Number.isFinite(duration) && duration > 0) {
    body.duration = Math.floor(duration)
  }

  void apiFetch(`/api/media/${mediaId}/play-state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Give the final update a chance to finish while the page is closing.
    keepalive: true,
  })
    .then(async (response) => {
      if (!response.ok) return

      const saved = (await response.json()) as MediaPlayProgress
      queryClient.setQueryData<MediaPlayProgress[]>(
        PLAY_PROGRESS_QUERY_KEY,
        (current) => {
          if (!current) return current

          return [
            saved,
            ...current.filter(
              (playState) => playState.mediaItemId !== saved.mediaItemId,
            ),
          ]
        },
      )
    })
    .catch(() => {
      // Playback reporting is best-effort and must never interrupt the player.
    })
}
