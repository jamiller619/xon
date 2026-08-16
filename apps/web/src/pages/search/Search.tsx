import type { MediaItem } from '@xon/shared'
import { Skeleton } from '@xon/ui'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MediaCard from '~/components/media-card/MediaCard'
import { apiFetch } from '~/lib/apiFetch'
import { useAppStore } from '~/store/appStore'
import styles from './Search.module.css'

const MEDIA_CATEGORIES = [
  { label: 'Movies', value: 'video/movie' },
  { label: 'TV Shows', value: 'video/tvshow' },
  { label: 'Music', value: 'audio' },
  { label: 'Photos', value: 'image' },
  { label: 'Videos', value: 'video' },
] as const

const PAGE_SIZE = 20

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { viewMode, setViewMode } = useAppStore()

  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const requestedPage = Number(searchParams.get('page') ?? '1')
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  const [results, setResults] = useState<MediaItem[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!q) {
      setResults([])
      setTotalPages(1)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const controller = new AbortController()

    const params = new URLSearchParams({
      q,
      page: String(page),
      limit: String(PAGE_SIZE),
    })
    if (category) params.set('category', category)

    apiFetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Search request failed')
        const data: unknown = await response.json()
        if (!Array.isArray(data)) throw new Error('Invalid search response')

        const totalPages = Number(response.headers.get('X-Total-Pages'))
        return {
          rows: data as MediaItem[],
          totalPages:
            Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1,
        }
      })
      .then(({ rows, totalPages }) => {
        if (controller.signal.aborted) return
        setResults(rows)
        setTotalPages(totalPages)
        setLoading(false)
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return
        }
        setError('Search failed. Please try again.')
        setLoading(false)
      })

    return () => controller.abort()
  }, [q, category, page])

  function setCategory(val: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (val) next.set('category', val)
      else next.delete('category')
      next.delete('page')
      return next
    })
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p > 1) next.set('page', String(p))
      else next.delete('page')
      return next
    })
  }

  return (
    <div className={styles.page ?? ''}>
      <header className={styles.header ?? ''}>
        <h1 className={styles.title ?? ''}>
          {q ? (
            <>
              Results for <span className={styles.query ?? ''}>{q}</span>
            </>
          ) : (
            'Search'
          )}
        </h1>
        <div className={styles.viewToggle ?? ''}>
          <button
            type="button"
            className={`${styles.toggleBtn ?? ''} ${viewMode === 'grid' ? (styles.toggleActive ?? '') : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            ▦
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn ?? ''} ${viewMode === 'list' ? (styles.toggleActive ?? '') : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            ☰
          </button>
        </div>
      </header>

      {/* Category tabs */}
      <div className={styles.tabs ?? ''}>
        <button
          type="button"
          className={`${styles.tab ?? ''} ${!category ? (styles.tabActive ?? '') : ''}`}
          onClick={() => setCategory('')}
        >
          All
        </button>
        {MEDIA_CATEGORIES.map((categoryOption) => (
          <button
            key={categoryOption.value}
            type="button"
            className={`${styles.tab ?? ''} ${category === categoryOption.value ? (styles.tabActive ?? '') : ''}`}
            onClick={() => setCategory(categoryOption.value)}
          >
            {categoryOption.label}
          </button>
        ))}
      </div>

      {error && <p className={styles.error ?? ''}>{error}</p>}

      {!q && !loading && (
        <p className={styles.empty ?? ''}>Enter a search term to find media.</p>
      )}

      {viewMode === 'grid' ? (
        loading ? (
          <div className={styles.grid ?? ''}>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className={styles.skeletonCard ?? ''} />
            ))}
          </div>
        ) : results.length === 0 && q ? (
          <p className={styles.empty ?? ''}>
            No results found for &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <div className={styles.grid ?? ''}>
            {results.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )
      ) : (
        <div className={styles.tableWrapper ?? ''}>
          <table className={styles.table ?? ''}>
            <thead>
              <tr>
                <th className={`${styles.th ?? ''} ${styles.thThumb ?? ''}`} />
                <th className={styles.th ?? ''}>Title</th>
                <th className={styles.th ?? ''}>Duration</th>
                <th className={styles.th ?? ''}>Size</th>
                <th className={styles.th ?? ''}>Year</th>
                <th className={styles.th ?? ''}>Date Added</th>
                <th className={styles.th ?? ''} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                  <tr key={i} className={styles.skeletonRow ?? ''}>
                    <td colSpan={7}>
                      <Skeleton className={styles.skeletonLine ?? ''} />
                    </td>
                  </tr>
                ))
              ) : results.length === 0 && q ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell ?? ''}>
                    No results found for &ldquo;{q}&rdquo;.
                  </td>
                </tr>
              ) : (
                results.map((item) => (
                  <MediaCard key={item.id} item={item} listView />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination ?? ''}>
          <button
            type="button"
            className={styles.pageBtn ?? ''}
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span className={styles.pageInfo ?? ''}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn ?? ''}
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
