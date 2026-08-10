import { useMutation, useQuery } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { collectionsAPI } from '../lib/rpc'

export type CollectionResponse = InferResponseType<
  typeof collectionsAPI.index.$get,
  200
>[number]

type AddCollectionItemRequest = InferRequestType<
  (typeof collectionsAPI)[':id']['items']['$post']
>

export type AddMediaToCollectionInput = {
  collectionId: AddCollectionItemRequest['param']['id']
  mediaItemId: AddCollectionItemRequest['json']['mediaItemId']
  sortOrder?: AddCollectionItemRequest['json']['sortOrder']
}

export default function useCollections() {
  const { data: collections } = useQuery({
    queryKey: ['collections'] as const,
    queryFn: async () => {
      const res = await collectionsAPI.index.$get()

      if (!res.ok) throw new Error(res.statusText)

      return res.json()
    },
  })

  const addMediaToCollection = useMutation({
    mutationFn: async ({
      collectionId,
      mediaItemId,
      sortOrder,
    }: AddMediaToCollectionInput) => {
      const json: AddCollectionItemRequest['json'] =
        sortOrder === undefined ? { mediaItemId } : { mediaItemId, sortOrder }
      const res = await collectionsAPI[':id'].items.$post({
        param: { id: collectionId },
        json,
      })

      if (!res.ok) throw new Error(res.statusText)

      return res.json()
    },
  })

  return [collections, addMediaToCollection] as const
}
