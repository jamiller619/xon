import type { ListColumn } from '../../types/collectionView'
import type { MovieSortKey } from './movieControls'

export const MOVIE_LIST_COLUMNS = [
  { key: 'thumbnail', width: '4.5rem' },
  { key: 'title', label: 'Title', sortKey: 'title' },
  { key: 'duration', label: 'Duration' },
  { key: 'fileSize', label: 'File Size', sortKey: 'fileSize' },
  { key: 'releaseDate', label: 'Release Date' },
  { key: 'createdAt', label: 'Date Added', sortKey: 'createdAt' },
  { key: 'actions', label: 'Actions', width: '6rem' },
] as const satisfies readonly ListColumn<MovieSortKey>[]
