import {
  Grid16Regular as GridIcon,
  List16Regular as ListIcon,
  ArrowSync16Regular as RefreshIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { LibraryStats } from '@xon/shared'
import { Button, Switch } from '@xon/ui'
import prettyBytes from 'pretty-bytes'
import { useRefreshMetadataConfirmation } from '~/components/confirmation/ConfirmationProvider'
import MediaCard from '~/components/media-card/MediaCard'
import { apiFetch } from '~/lib/apiFetch'
import styles from '../../Library.module.css'
import type { LibraryTypeViewProps } from '../../LibraryTypeView'
import GridView from '../../shared/components/GridView'
import LibraryViewControls from '../../shared/components/LibraryViewControls'
import LibraryViewLayout from '../../shared/components/LibraryViewLayout'
import ListView from '../../shared/components/ListView'
import { useLibraryViewMode } from '../../shared/hooks/useLibraryViewMode'
import type { LibraryViewModeDefinition } from '../../shared/types/collectionView'
import { MOVIE_LIST_COLUMNS } from './MovieListColumns'
import {
  DEFAULT_MOVIE_SORT,
  MOVIE_SORT_OPTIONS,
  type MovieSortKey,
  useMovieControls,
} from './movieControls'
import { useMovieLibraryMedia } from './useMovieLibraryMedia'
import { useRefreshMovieMetadata } from './useRefreshMovieMetadata'

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

export default function MoviesLibraryView({ library }: LibraryTypeViewProps) {
  const { viewMode, setViewMode } = useLibraryViewMode(
    library.id,
    MOVIE_VIEW_MODES,
    'grid',
  )
  const activeMode =
    MOVIE_VIEW_MODES.find((mode) => mode.id === viewMode) ?? MOVIE_VIEW_MODES[0]
  const controls = useMovieControls(
    activeMode.sortOptions,
    activeMode.defaultSort,
  )
  const metadataRefresh = useRefreshMovieMetadata(library.id)
  const confirmRefresh = useRefreshMetadataConfirmation()
  const { data: libraryStats } = useQuery<LibraryStats>({
    queryKey: ['library-stats', library.id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/libraries/${library.id}/stats`, {
        signal,
      })
      if (!response.ok) throw new Error('Failed to load library stats')
      return response.json()
    },
  })
  const mediaQuery = useMovieLibraryMedia({
    libraryId: library.id,
    sortKey: controls.sortKey,
    sortDirection: controls.sortDirection,
    mediaType: controls.mediaType,
    unmatchedOnly: controls.unmatchedOnly,
  })
  const items = mediaQuery.data?.pages.flatMap((page) => page.items) ?? []
  const resetKey = `${controls.sortKey}:${controls.sortDirection}:${controls.mediaType}:${controls.unmatchedOnly}`
  const collectionProps = {
    isLoading: mediaQuery.isPending,
    items,
    hasNextPage: mediaQuery.hasNextPage,
    isFetchingNextPage: mediaQuery.isFetchingNextPage,
    onLoadMore: () => void mediaQuery.fetchNextPage(),
    resetKey,
    getItemKey: (item: (typeof items)[number]) => item.id,
    emptyContent: 'No media in this library yet.',
  }
  const stats = [
    library.dataSources.length
      ? library.dataSources.map((source) => source.path).join(', ')
      : '',
    libraryStats
      ? `${libraryStats.totalItems.toLocaleString()} ${
          libraryStats.totalItems === 1 ? 'item' : 'items'
        }`
      : '',
    libraryStats ? prettyBytes(libraryStats.totalSize) : '',
  ].filter(Boolean)
  const error = mediaQuery.error
    ? 'Failed to load media'
    : metadataRefresh.error instanceof Error
      ? metadataRefresh.error.message
      : metadataRefresh.error
        ? 'Could not refresh library metadata'
        : undefined

  return (
    <LibraryViewLayout
      title={library.name}
      stats={stats}
      error={error}
      controls={
        <LibraryViewControls
          libraryId={library.id}
          modes={MOVIE_VIEW_MODES}
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
          actions={
            <Button
              loading={metadataRefresh.isRefreshing}
              disabled={metadataRefresh.isRefreshing}
              onClick={() => confirmRefresh(metadataRefresh.refresh)}
            >
              <RefreshIcon />
              {metadataRefresh.isRefreshing
                ? 'Refreshing metadata'
                : 'Refresh metadata'}
            </Button>
          }
        />
      }
    >
      {viewMode === 'grid' ? (
        <GridView
          {...collectionProps}
          renderItem={(item) => <MediaCard item={item} library={library} />}
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
              library={library}
              listView
              listRowProps={rowProps}
            />
          )}
        />
      )}
    </LibraryViewLayout>
  )
}
