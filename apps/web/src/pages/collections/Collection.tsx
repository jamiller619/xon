import { useQuery } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { useParams } from 'react-router-dom'
import { collectionsAPI } from '~/lib/rpc'
import styles from '../libraries/Library.module.css'
import Page from '../Page'
import { getCollectionTypeView } from './CollectionTypeView'

export type CollectionResponse = InferResponseType<
  (typeof collectionsAPI)[':id']['$get'],
  200
>

export default function CollectionBrowser() {
  const { id } = useParams<{ id: string }>()
  const {
    data: collection,
    error,
    isPending,
  } = useQuery<CollectionResponse>({
    queryKey: ['collection', id],
    queryFn: async () => {
      if (!id) throw new Error('Collection is unavailable')
      const response = await collectionsAPI[':id'].$get({ param: { id } })
      if (!response.ok) throw new Error('Failed to load collection')
      return response.json()
    },
    enabled: !!id,
  })

  if (!id) {
    return (
      <CollectionRouteError>Collection is unavailable</CollectionRouteError>
    )
  }
  if (isPending) return <Page>Loading collection…</Page>
  if (error || !collection) {
    return (
      <CollectionRouteError>Failed to load collection</CollectionRouteError>
    )
  }

  const CollectionView = getCollectionTypeView(collection.type)
  return <CollectionView collection={collection} />
}

function CollectionRouteError({ children }: { children: React.ReactNode }) {
  return (
    <Page>
      <div className={styles.error} role="alert">
        {children}
      </div>
    </Page>
  )
}
