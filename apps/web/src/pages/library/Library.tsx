import { useQuery } from '@tanstack/react-query'
import type { Library, LibraryStats } from '@xon/shared'
import prettyBytes from 'pretty-bytes'
import { useParams } from 'react-router-dom'
import { apiFetch } from '~/lib/apiFetch'
import { useAppStore } from '~/store/appStore'
import GridView from './components/GridView'
import LibraryToolbar from './components/LibraryToolbar'
import ListView from './components/ListView'
import { useLibraryControls } from './components/libraryControls'
import { useLibraryMedia } from './hooks/useLibraryMedia'
import { useRefreshLibraryMetadata } from './hooks/useRefreshLibraryMetadata'
import styles from './Library.module.css'

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>()
  const { viewMode, setViewMode } = useAppStore()
  const controls = useLibraryControls()
  const metadataRefresh = useRefreshLibraryMetadata(id)

  const { data: library, error: libraryError } = useQuery<Library>({
    queryKey: ['library', id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/libraries/${id}`, { signal })
      if (!response.ok) throw new Error('Failed to load library')
      return response.json()
    },
    enabled: !!id,
  })

  const { data: libraryStats, error: libraryStatsError } =
    useQuery<LibraryStats>({
      queryKey: ['library-stats', id],
      queryFn: async ({ signal }) => {
        const response = await apiFetch(`/api/libraries/${id}/stats`, {
          signal,
        })
        if (!response.ok) throw new Error('Failed to load library stats')
        return response.json()
      },
      enabled: !!id,
    })

  const mediaQuery = useLibraryMedia({
    libraryId: id,
    sortCol: controls.sortCol,
    sortDir: controls.sortDir,
    mediaType: controls.mediaType,
    unmatchedOnly: controls.unmatchedOnly,
  })
  const items = mediaQuery.data?.pages.flatMap((page) => page.items) ?? []
  const viewProps = {
    isLoading: mediaQuery.isPending,
    items,
    hasNextPage: mediaQuery.hasNextPage,
    isFetchingNextPage: mediaQuery.isFetchingNextPage,
    onLoadMore: () => void mediaQuery.fetchNextPage(),
    resetKey: `${controls.sortCol}:${controls.sortDir}:${controls.mediaType}:${controls.unmatchedOnly}`,
  }

  if (mediaQuery.error || libraryError) {
    return (
      <div className={styles.error} role="alert">
        {mediaQuery.error ? 'Failed to load media' : 'Failed to load library'}
      </div>
    )
  }

  return (
    <div className={styles.browser}>
      <header className={styles.header}>
        <div className={styles.titleContainer}>
          <h1 className={styles.title}>{library?.name ?? 'Library'}</h1>
          <div className={styles.libraryStats}>
            {library?.dataSources.length ? (
              <span
                className={styles.libraryPath}
                title={library.dataSources
                  .map((source) => source.path)
                  .join(', ')}
              >
                {library.dataSources.map((source) => source.path).join(', ')}
              </span>
            ) : null}
            {libraryStats && (
              <>
                <span>
                  {libraryStats.totalItems.toLocaleString()}{' '}
                  {libraryStats.totalItems === 1 ? 'item' : 'items'}
                </span>
                <span>{prettyBytes(libraryStats.totalSize)}</span>
              </>
            )}
            {libraryStatsError && <span>Stats unavailable</span>}
          </div>
        </div>
        <LibraryToolbar
          viewMode={viewMode}
          currentSortKey={controls.currentSortKey}
          mediaType={controls.mediaType}
          unmatchedOnly={controls.unmatchedOnly}
          isRefreshingMetadata={metadataRefresh.isRefreshing}
          onViewModeChange={setViewMode}
          onSortOptionChange={controls.handleSortOption}
          onMediaTypeChange={controls.setMediaType}
          onUnmatchedOnlyChange={controls.setUnmatchedOnly}
          onRefreshMetadata={metadataRefresh.refresh}
        />
      </header>

      {metadataRefresh.error && (
        <div className={styles.error} role="alert">
          {metadataRefresh.error instanceof Error
            ? metadataRefresh.error.message
            : 'Could not refresh library metadata'}
        </div>
      )}

      {viewMode === 'grid' ? (
        <GridView {...viewProps} />
      ) : (
        <ListView
          {...viewProps}
          sortCol={controls.sortCol}
          sortDir={controls.sortDir}
          onSort={controls.handleSort}
        />
      )}
    </div>
  )
}
