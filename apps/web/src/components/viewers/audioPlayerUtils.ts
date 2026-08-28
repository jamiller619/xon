import type { RepeatMode } from '~/store/audioStore'

export type EndedPlaybackAction = 'advance' | 'restart'

export function normalizeMediaTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function formatPlaybackTime(value: number): string {
  const totalSeconds = Math.floor(normalizeMediaTime(value))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function endedPlaybackAction(repeat: RepeatMode): EndedPlaybackAction {
  return repeat === 'one' ? 'restart' : 'advance'
}
