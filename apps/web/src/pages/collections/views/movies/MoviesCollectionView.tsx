import type {
  SortOption,
  SortValue,
} from '../../../libraries/types/collectionView'
import MoviesView from '../../../libraries/views/movies/MoviesView'
import type { MovieSortKey } from '../../../libraries/views/movies/movieControls'
import type { CollectionTypeViewProps } from '../../CollectionTypeView'

const COLLECTION_MOVIE_SORT_OPTIONS = [
  { label: 'Custom order', key: 'sortOrder', direction: 'asc' },
  { label: 'Title A→Z', key: 'title', direction: 'asc' },
  { label: 'Title Z→A', key: 'title', direction: 'desc' },
  { label: 'Date Added (newest)', key: 'createdAt', direction: 'desc' },
  { label: 'Date Added (oldest)', key: 'createdAt', direction: 'asc' },
  { label: 'File Size (largest)', key: 'fileSize', direction: 'desc' },
  { label: 'File Size (smallest)', key: 'fileSize', direction: 'asc' },
] as const satisfies readonly SortOption<MovieSortKey>[]

const DEFAULT_COLLECTION_SORT = {
  key: 'sortOrder',
  direction: 'asc',
} as const satisfies SortValue<MovieSortKey>

export default function MoviesCollectionView({
  collection,
}: CollectionTypeViewProps) {
  return (
    <MoviesView
      source={{ kind: 'collection', id: collection.id }}
      title={collection.title}
      sortOptions={COLLECTION_MOVIE_SORT_OPTIONS}
      defaultSort={DEFAULT_COLLECTION_SORT}
      emptyContent="No media in this collection yet."
    />
  )
}
