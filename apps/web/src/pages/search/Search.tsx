import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/apiFetch.js'
import MediaCard, { type MediaCardItem } from '../../components/media-card/MediaCard.js'
import { useAppStore } from '../../store/appStore.js'
import styles from './Search.module.css'

const MEDIA_CATEGORIES = [
  'Movies',
  'TV Shows',
  'Clips',
  'Music',
  'Audiobooks',
  'Audio Clips',
  'Podcasts',
  'Pictures',
  'Images',
  'Textures',
  'Home Videos',
  'Games',
  'Interactive Media',
  'Documents',
  'Web Media',
  'Design Files',
  '3D Models',
  'Archives',
  'Fonts',
  'Icons',
] as const

const PAGE_SIZE = 20

interface SearchResult {
  id: string
  title: string | null
  mediaCategory: string | null
  thumbnailUrls: { small: string; medium: string; large: string } | null
  createdAt: string | null
}

function toMediaCardItem(r: SearchResult): MediaCardItem {
  return {
    id: r.id,
    title: r.title ?? r.id,
    mediaCategory: r.mediaCategory,
    mimeType: null,
    fileSize: null,
    createdAt: r.createdAt
      ? Math.floor(new Date(r.createdAt).getTime() / 1000)
      : null,
    thumbnailUrls: r.thumbnailUrls,
  }
}

function SkeletonCard() {
  return <div className={styles.skeletonCard ?? ''} />
}

function SkeletonRow() {
  return (
    <tr className={styles.skeletonRow ?? ''}>
      <td colSpan={4}>
        <div className={styles.skeletonLine ?? ''} />
      </td>
    </tr>
  )
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { viewMode, setViewMode } = useAppStore()

  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  const [results, setResults] = useState<MediaCardItem[]>([])
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

    const params = new URLSearchParams({
      q,
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    })
    if (category) params.set('category', category)

    apiFetch(`/api/v1/search?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const rows = (data as { results: SearchResult[] }).results
        setResults(rows.map(toMediaCardItem))
        if (rows.length === PAGE_SIZE) {
          setTotalPages((prev) => Math.max(prev, page + 1))
        } else {
          setTotalPages(page)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Search failed. Please try again.')
        setLoading(false)
      })
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
        {MEDIA_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`${styles.tab ?? ''} ${category === cat ? (styles.tabActive ?? '') : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
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
              <SkeletonCard key={i} />
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
                <th className={styles.th ?? ''}>Category</th>
                <th className={styles.th ?? ''}>Date Added</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                  <SkeletonRow key={i} />
                ))
              ) : results.length === 0 && q ? (
                <tr>
                  <td colSpan={4} className={styles.emptyCell ?? ''}>
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
