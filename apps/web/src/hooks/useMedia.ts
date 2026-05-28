import type { MediaItem } from '@xon/shared'
import { useEffect, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'

type UseMediaProps = {
  libraryId?: string
  order?: string
  limit?: number
}

export default function useMedia(props: UseMediaProps) {
  // const [media, setMedia] = useState<MediaItem[]>([])
  // const [isLoading, setIsLoading] = useState(false)
  // const [error, setError] = useState<string | null>(null)

  // useEffect(() => {
  //   const fetchData = async () => {
  //     const libraryId = props.libraryId
  //     const order = props.order ?? 'desc'
  //     const limit = props.limit ?? 10
  //     const baseURL = libraryId
  //       ? `/api/libraries/${libraryId}/media`
  //       : '/api/media'

  //     setIsLoading(true)

  //     const res = await apiFetch(`${baseURL}?order=${order}&limit=${limit}`)
  //     const data = (await res.json()) as MediaItem[]

  //     setMedia(data)
  //     setIsLoading(false)
  //   }

  //   fetchData()
  //     .catch(setError)
  //     .finally(() => setIsLoading(false))
  // }, [props.libraryId, props.order, props.limit])
  const media = [] as MediaItem[]
  const isLoading = false
  const error = null

  return {
    media,
    isLoading,
    error,
  }
}
