import {
  GridRegular as GridIcon,
  ListRegular as ListIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { Library, MediaItem } from '@xon/shared'
import { Label, Select, ToggleButton, ToggleButtonGroup } from '@xon/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '~/lib/apiFetch'
import { subscribeToEvents } from '~/lib/eventStream'
import { useAppStore } from '~/store/appStore'
import { makeSortKey, SORT_OPTIONS, useFilters } from './components/filters'
import GridView from './components/GridView'
import ListView from './components/ListView'
import type { ActiveFilter } from './components/types'
import styles from './Library.module.css'

const PAGE_SIZE = 40

/** Minimum gap between mid-scan refreshes of the visible media list. */
const SCAN_REFRESH_THROTTLE_MS = 3000

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>()
  const { viewMode, setViewMode } = useAppStore()
  const { sortCol, sortDir, page, setPage, handleSortOption, currentSortKey } =
    useFilters()

  const [items, setItems] = useState<MediaItem[]>([])

  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterCategory, setFilterCategory] = useState('')

  const { data: library, error: libraryError } = useQuery<Library>({
    queryKey: ['library', id],
    queryFn: () => apiFetch(`/api/libraries/${id}`).then((r) => r.json()),
    enabled: !!id,
  })

  // A "silent" fetch keeps the current items on screen instead of flashing
  // skeletons — used for live refreshes while a scan is running
  const fetchMedia = useCallback(
    (silent: boolean) => {
      if (!id) return
      if (!silent) setLoading(true)
      const apiSortBy = sortCol
      const params = new URLSearchParams({
        order: sortDir,
        sortBy: apiSortBy,
        limit: String(PAGE_SIZE),
        page: String(page),
      })
      if (filterCategory) params.set('mediaCategory', filterCategory)
      apiFetch(`/api/libraries/${id}/media?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          const mediaList = data as MediaItem[]
          setItems(mediaList)
          if (mediaList.length === PAGE_SIZE) {
            setTotalPages((prev) => Math.max(prev, page + 1))
          } else {
            setTotalPages(page)
          }
          setLoading(false)
        })
        .catch(() => {
          setError('Failed to load media')
          setLoading(false)
        })
    },
    [id, page, sortCol, sortDir, filterCategory],
  )

  useEffect(() => {
    fetchMedia(false)
  }, [fetchMedia])

  // Kept current every render so the scan subscription below always refreshes
  // with the latest filters/page/tab without resubscribing
  const refreshLiveRef = useRef(() => {})
  refreshLiveRef.current = () => {
    fetchMedia(true)
  }

  // Refresh the visible list live while this library is being scanned
  useEffect(() => {
    if (!id) return

    let lastRefresh = 0

    return subscribeToEvents((event) => {
      if (
        event.type !== 'scan:progress' &&
        event.type !== 'scan:complete' &&
        event.type !== 'scan:error'
      )
        return
      if (event.payload.libraryId !== id) return
      // No items are written during discovery
      if (
        event.type === 'scan:progress' &&
        event.payload.phase === 'discovering'
      )
        return

      const now = Date.now()
      if (
        event.type === 'scan:progress' &&
        now - lastRefresh < SCAN_REFRESH_THROTTLE_MS
      )
        return

      lastRefresh = now
      refreshLiveRef.current()
    })
  }, [id])

  function handleCategoryFilter(value: string) {
    setFilterCategory(value)
    setPage(1)
    setTotalPages(1)
  }

  const activeFilters: ActiveFilter[] = []
  if (filterCategory) {
    activeFilters.push({
      key: 'category',
      label: `Category: ${filterCategory}`,
      onRemove: () => handleCategoryFilter(''),
    })
  }

  if (error || libraryError) {
    return (
      <div className={styles.error}>{error ?? 'Failed to load library'}</div>
    )
  }

  return (
    <div className={styles.browser}>
      <header className={styles.header}>
        <div className={styles.titleContainer}>
          <h6 className={styles.title}>{library?.name ?? 'Library'}</h6>
          <span>{library?.dataSources.map((ds) => ds.path).join(', ')}</span>
        </div>
        <ToggleButtonGroup value={[viewMode]}>
          <ToggleButton onClick={() => setViewMode('grid')} value="grid">
            <GridIcon />
          </ToggleButton>
          <ToggleButton onClick={() => setViewMode('list')} value="list">
            <ListIcon />
          </ToggleButton>
        </ToggleButtonGroup>
      </header>

      {viewMode === 'grid' ? (
        <GridView
          isLoading={loading}
          items={items}
          pageSize={PAGE_SIZE}
          activeFilters={activeFilters}
          currentSortKey={currentSortKey}
          filterCategory={filterCategory}
          handleCategoryFilter={handleCategoryFilter}
          handleSortOption={handleSortOption}
        />
      ) : (
        <ListView isLoading={loading} items={items} pageSize={PAGE_SIZE} />
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
