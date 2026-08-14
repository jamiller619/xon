import {
  Grid16Regular as GridIcon,
  List16Regular as ListIcon,
} from '@fluentui/react-icons'
import type { Library } from '@xon/shared'
import { Switch } from '@xon/ui'
import type { ReactNode } from 'react'
import MediaCard from '~/components/media-card/MediaCard'
import GridView from '../../components/GridView'
import LibraryViewControls from '../../components/LibraryViewControls'
import LibraryViewLayout from '../../components/LibraryViewLayout'
import ListView from '../../components/ListView'
import SelectWrapper from '../../components/SelectWrapper'
import ThumbnailSizeControl from '../../components/ThumbnailSizeControl'
import { useLibraryThumbnailSize } from '../../hooks/useLibraryThumbnailSize'
import { useLibraryViewMode } from '../../hooks/useLibraryViewMode'
import styles from '../../Library.module.css'
import type {
  LibraryViewModeDefinition,
  SortOption,
  SortValue,
} from '../../types/collectionView'
import { MOVIE_LIST_COLUMNS } from './MovieListColumns'
import {
  DEFAULT_MOVIE_SORT,
  MOVIE_SORT_OPTIONS,
  type MovieSortKey,
  useMovieControls,
} from './movieControls'
import { type MovieMediaSource, useMovieMedia } from './useMovieLibraryMedia'

type MovieViewMode = 'grid' | 'list'

const MOVIE_VIEW_MODES = [
  {
    id: 'grid',
    label: 'Grid',
    icon: <GridIcon />,
    sortPresentation: 'toolbar',
    sortOptions: MOVIE_SORT_OPTIONS,
    defaultSort: DEFAULT_MOVIE_SORT,
  },
  {
    id: 'list',
    label: 'List',
    icon: <ListIcon />,
    sortPresentation: 'columns',
    sortOptions: MOVIE_SORT_OPTIONS,
    defaultSort: DEFAULT_MOVIE_SORT,
  },
] as const satisfies readonly LibraryViewModeDefinition<
  MovieViewMode,
  MovieSortKey
>[]

type MoviesViewProps = {
  source: MovieMediaSource
  title: string
  stats?: string[]
  actions?: ReactNode
  error?: ReactNode
  library?: Library
  sortOptions?: readonly SortOption<MovieSortKey>[]
  defaultSort?: SortValue<MovieSortKey>
  emptyContent?: ReactNode
}

export default function MoviesView({
  source,
  title,
  stats,
  actions,
  error: sourceError,
  library,
  sortOptions = MOVIE_SORT_OPTIONS,
  defaultSort = DEFAULT_MOVIE_SORT,
  emptyContent = 'No media yet.',
}: MoviesViewProps) {
  const resourceKey =
    source.kind === 'library' ? source.id : `collection:${source.id}`
  const { thumbnailSize, setThumbnailSize } = useLibraryThumbnailSize(
    resourceKey,
    160,
  )
  const modes = MOVIE_VIEW_MODES.map((mode) => ({
    ...mode,
    sortOptions,
    defaultSort,
  }))
  const { viewMode, setViewMode } = useLibraryViewMode(
    resourceKey,
    modes,
    'grid',
  )
  const activeMode = modes.find((mode) => mode.id === viewMode) ?? modes[0]
  const controls = useMovieControls(
    activeMode?.sortOptions ?? sortOptions,
    activeMode?.defaultSort ?? defaultSort,
  )
  const mediaQuery = useMovieMedia({
    source,
    sortKey: controls.sortKey,
    sortDirection: controls.sortDirection,
    mediaType: controls.mediaType,
    unmatchedOnly: controls.unmatchedOnly,
  })
  const items = mediaQuery.data?.pages.flatMap((page) => page.items) ?? []
  const resetKey = `${source.kind}:${source.id}:${controls.sortKey}:${controls.sortDirection}:${controls.mediaType}:${controls.unmatchedOnly}`
  const collectionProps = {
    isLoading: mediaQuery.isPending,
    items,
    hasNextPage: mediaQuery.hasNextPage,
    isFetchingNextPage: mediaQuery.isFetchingNextPage,
    onLoadMore: () => void mediaQuery.fetchNextPage(),
    resetKey,
    getItemKey: (item: (typeof items)[number]) => item.id,
    emptyContent,
  }
  const error = mediaQuery.error ? 'Failed to load media' : sourceError

  return (
    <LibraryViewLayout
      title={title}
      {...(stats ? { stats } : {})}
      {...(error ? { error } : {})}
      footer={
        viewMode === 'grid' ? (
          <ThumbnailSizeControl
            value={thumbnailSize}
            onChange={setThumbnailSize}
          />
        ) : undefined
      }
      controls={
        <LibraryViewControls
          {...(source.kind === 'library' ? { libraryId: source.id } : {})}
          modes={modes}
          viewMode={viewMode}
          sortKey={controls.sortKey}
          sortDirection={controls.sortDirection}
          onViewModeChange={setViewMode}
          onSortOptionChange={controls.handleSortOption}
          filters={
            <Switch
              className={styles.unmatchedFilter}
              label="Unmatched titles"
              checked={controls.unmatchedOnly}
              onChange={controls.setUnmatchedOnly}
            />
          }
          {...(actions ? { actions } : {})}
        />
      }
    >
      {viewMode === 'grid' ? (
        <GridView
          {...collectionProps}
          minCardWidth={thumbnailSize}
          renderItem={(item) => (
            <SelectWrapper id={item.id}>
              {(onOpen) => (
                <MediaCard
                  item={item}
                  {...(library ? { library } : {})}
                  {...(onOpen ? { onOpen } : {})}
                />
              )}
            </SelectWrapper>
          )}
        />
      ) : (
        <ListView
          {...collectionProps}
          columns={MOVIE_LIST_COLUMNS}
          sortKey={controls.sortKey}
          sortDirection={controls.sortDirection}
          onSort={controls.handleSort}
          renderRow={(item, rowProps) => (
            <MediaCard
              item={item}
              {...(library ? { library } : {})}
              listView
              listRowProps={rowProps}
            />
          )}
        />
      )}
    </LibraryViewLayout>
  )
}
