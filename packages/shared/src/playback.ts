export const PLAYBACK_CLIENTS = [
  'web',
  'ios',
  'android',
  'apple-tv',
  'android-tv',
] as const

export type PlaybackClient = (typeof PLAYBACK_CLIENTS)[number]

export const DEFAULT_PLAYBACK_CLIENT: PlaybackClient = 'web'

/**
 * Parse the client supplied to playback routes. Unknown clients use the
 * conservative web profile until a dedicated profile is registered.
 */
export function parsePlaybackClient(value: string | undefined): PlaybackClient {
  return PLAYBACK_CLIENTS.includes(value as PlaybackClient)
    ? (value as PlaybackClient)
    : DEFAULT_PLAYBACK_CLIENT
}
