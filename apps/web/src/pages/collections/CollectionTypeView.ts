import type { CollectionType } from '@xon/shared'
import type { ComponentType } from 'react'
import type { CollectionResponse } from './Collection'
import MoviesCollectionView from './views/movies/MoviesCollectionView'

export type CollectionTypeViewProps = {
  collection: CollectionResponse
}

const COLLECTION_TYPE_VIEW_OVERRIDES: Partial<
  Record<CollectionType, ComponentType<CollectionTypeViewProps>>
> = {}

export function getCollectionTypeView(type: CollectionType) {
  return COLLECTION_TYPE_VIEW_OVERRIDES[type] ?? MoviesCollectionView
}
