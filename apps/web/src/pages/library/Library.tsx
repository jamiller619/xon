import { useQuery } from '@tanstack/react-query'
import type { Library } from '@xon/shared'
import { useParams } from 'react-router-dom'
import { apiFetch } from '~/lib/apiFetch'
import { useAppStore } from '~/store/appStore'
import GridView from './components/GridView'
import LibraryToolbar from './components/LibraryToolbar'
import ListView from './components/ListView'
import { useLibraryControls } from './components/libraryControls'
import { useLibraryMedia } from './hooks/useLibraryMedia'
import styles from './Library.module.css'

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>()
  const { viewMode, setViewMode } = useAppStore()
  const controls = useLibraryControls()

  const { data: library, error: libraryError } = useQuery<Library>({
    queryKey: ['library', id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/libraries/${id}`, { signal })
      if (!response.ok) throw new Error('Failed to load library')
      return response.json()
    },
    enabled: !!id,
  })

  const mediaQuery = useLibraryMedia({
    libraryId: id,
    sortCol: controls.sortCol,
    sortDir: controls.sortDir,
    mediaType: controls.mediaType,
  })
  const items = mediaQuery.data?.pages.flatMap((page) => page.items) ?? []
  const viewProps = {
    isLoading: mediaQuery.isPending,
    items,
    hasNextPage: mediaQuery.hasNextPage,
    isFetchingNextPage: mediaQuery.isFetchingNextPage,
    onLoadMore: () => void mediaQuery.fetchNextPage(),
    resetKey: `${controls.sortCol}:${controls.sortDir}:${controls.mediaType}`,
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
          <span>{library?.dataSources.map((ds) => ds.path).join(', ')}</span>
        </div>
        <LibraryToolbar
          viewMode={viewMode}
          currentSortKey={controls.currentSortKey}
          mediaType={controls.mediaType}
          onViewModeChange={setViewMode}
          onSortOptionChange={controls.handleSortOption}
          onMediaTypeChange={controls.setMediaType}
        />
      </header>

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
