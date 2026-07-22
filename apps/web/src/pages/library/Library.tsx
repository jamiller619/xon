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
import { useLibraryPageSize } from './hooks/useLibraryPageSize'
import styles from './Library.module.css'

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>()
  const { viewMode, setViewMode } = useAppStore()
  const controls = useLibraryControls()
  const { gridViewportRef, pageSize } = useLibraryPageSize({
    viewMode,
    setPage: controls.setPage,
  })

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
    page: controls.page,
    pageSize,
    sortCol: controls.sortCol,
    sortDir: controls.sortDir,
    mediaType: controls.mediaType,
  })
  const items = mediaQuery.data?.items ?? []
  const totalPages = Math.max(
    1,
    Math.ceil((mediaQuery.data?.total ?? 0) / pageSize),
  )

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
        <div ref={gridViewportRef} className={styles.gridViewport}>
          <GridView
            isLoading={mediaQuery.isPending}
            items={items}
            pageSize={pageSize}
          />
        </div>
      ) : (
        <ListView
          isLoading={mediaQuery.isPending}
          items={items}
          pageSize={pageSize}
          sortCol={controls.sortCol}
          sortDir={controls.sortDir}
          onSort={controls.handleSort}
        />
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => controls.setPage((page) => Math.max(1, page - 1))}
            disabled={controls.page === 1}
          >
            ← Prev
          </button>
          <span className={styles.pageInfo}>
            Page {controls.page} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => controls.setPage((page) => page + 1)}
            disabled={controls.page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
