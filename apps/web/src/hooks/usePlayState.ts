import { useQuery } from '@tanstack/react-query'
import type { MediaPlayProgress } from '@xon/shared'
import useQueryAPIHelper from './useQueryAPIHelper'

export default function usePlayState(mediaItemId: string) {
  return useQuery<MediaPlayProgress[], Error, MediaPlayProgress | undefined>({
    ...useQueryAPIHelper('playProgress'),
    select: (playStates) =>
      playStates.find((playState) => playState.mediaItemId === mediaItemId),
  }).data
}
