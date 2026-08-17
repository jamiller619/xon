import {
  Grid16Regular as GridIcon,
  List16Regular as ListIcon,
  ChevronRight16Regular as NextIcon,
  ChevronLeft16Regular as PreviousIcon,
  Search20Regular as SearchIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import {
  Button,
  Card,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
} from '@xon/ui'
import { type RefObject, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import FilterHeader from '~/components/FilterHeader'
import MediaCard from '~/components/media-card/MediaCard'
import { useResponsivePageSize } from '~/hooks/useResponsivePageSize'
import { apiFetch } from '~/lib/apiFetch'
import Page from '~/pages/Page'
import { useAppStore } from '~/store/appStore'
import styles from './Search.module.css'

const ALL_CATEGORIES = 'all'
const CAPACITY_PROBES = Array.from(
  { length: 16 },
  (_, index) => `capacity-${index}`,
)

const MEDIA_CATEGORIES = [
  { label: 'Movies', value: 'video/movie' },
  { label: 'TV Shows', value: 'video/tvshow' },
  { label: 'Music', value: 'audio' },
  { label: 'Photos', value: 'image' },
  { label: 'Videos', value: 'video' },
] as const

type SearchPage = {
  items: MediaItem[]
  totalCount: number
  totalPages: number
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const viewMode = useAppStore(({ viewMode }) => viewMode)
  const setViewMode = useAppStore(({ setViewMode }) => setViewMode)

  const query = searchParams.get('q')?.trim() ?? ''
  const category = searchParams.get('category') ?? ''
  const requestedPage = Number(searchParams.get('page') ?? '1')
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const resultsRef = useRef<HTMLElement>(null)
  const capacityGridRef = useRef<HTMLDivElement>(null)
  const capacityRowRef = useRef<HTMLElement>(null)
  const capacityHeaderRef = useRef<HTMLTableSectionElement>(null)
  const capacityFooterRef = useRef<HTMLElement>(null)
  const previousPageSizeRef = useRef<number | null>(null)
  const getColumnCount = useCallback(() => {
    if (viewMode !== 'grid') return 1

    const probe = capacityGridRef.current
    const firstItem = probe?.firstElementChild as HTMLElement | null
    if (!probe || !firstItem) return 1

    const firstRowTop = firstItem.offsetTop
    const nextRowIndex = Array.from(probe.children).findIndex(
      (item) => (item as HTMLElement).offsetTop > firstRowTop,
    )
    return nextRowIndex === -1 ? probe.children.length : nextRowIndex
  }, [viewMode])
  const getRowGap = useCallback(() => {
    if (viewMode !== 'grid' || !capacityGridRef.current) return 0
    const gap = Number.parseFloat(
      getComputedStyle(capacityGridRef.current).rowGap,
    )
    return Number.isFinite(gap) ? gap : 0
  }, [viewMode])
  const pageSize = useResponsivePageSize({
    containerRef: resultsRef,
    footerRef: capacityFooterRef,
    getColumnCount,
    getRowGap,
    headerRef: capacityHeaderRef,
    rowRef: capacityRowRef,
  })
  const setPage = useCallback(
    (nextPage: number, replace = false) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (nextPage > 1) next.set('page', String(nextPage))
          else next.delete('page')
          return next
        },
        { replace },
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (pageSize === null) return

    const previousPageSize = previousPageSizeRef.current
    previousPageSizeRef.current = pageSize
    if (previousPageSize === null || previousPageSize === pageSize) return

    const firstResultIndex = (page - 1) * previousPageSize
    const nextPage = Math.floor(firstResultIndex / pageSize) + 1
    if (nextPage !== page) setPage(nextPage, true)
  }, [page, pageSize, setPage])

  const search = useQuery<SearchPage>({
    queryKey: ['search', 'page', query, category, page, pageSize],
    queryFn: async ({ signal }) => {
      if (pageSize === null) throw new Error('Page size is not available')
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        limit: String(pageSize),
      })
      if (category) params.set('category', category)

      const response = await apiFetch(`/api/search?${params.toString()}`, {
        signal,
      })
      if (!response.ok) throw new Error('Search request failed')

      const data: unknown = await response.json()
      if (!Array.isArray(data)) throw new Error('Invalid search response')

      return {
        items: data as MediaItem[],
        totalCount: parseCountHeader(
          response.headers.get('X-Total-Count'),
          data.length,
        ),
        totalPages: parseCountHeader(
          response.headers.get('X-Total-Pages'),
          1,
          1,
        ),
      }
    },
    enabled: query.length > 0 && pageSize !== null,
  })

  const items = search.data?.items ?? []
  const totalCount = search.data?.totalCount ?? 0
  const totalPages = search.data?.totalPages ?? 1
  const stats = getSearchStats({
    query,
    page,
    totalCount,
    totalPages,
    isPending: search.isPending,
    hasError: search.isError,
  })

  function setCategory(value: string) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set('category', value)
      else next.delete('category')
      next.delete('page')
      return next
    })
  }

  function focusSearch() {
    document
      .querySelector<HTMLInputElement>('input[aria-label="Search media"]')
      ?.focus()
  }

  const statusAnnouncement = !query
    ? 'Enter a search term to find media.'
    : search.isPending
      ? `Searching for ${query}.`
      : search.isError
        ? 'Search failed.'
        : `${totalCount} ${totalCount === 1 ? 'result' : 'results'} found for ${query}.`

  return (
    <Page className={styles.page}>
      <FilterHeader title="Search" stats={stats}>
        <div className={styles.toolbarContents}>
          <div className={styles.categoryScroller}>
            <ToggleButtonGroup
              aria-label="Filter search results by media type"
              value={[category || ALL_CATEGORIES]}
            >
              <ToggleButton
                value={ALL_CATEGORIES}
                onClick={() => setCategory('')}
              >
                All
              </ToggleButton>
              {MEDIA_CATEGORIES.map((option) => (
                <ToggleButton
                  key={option.value}
                  value={option.value}
                  onClick={() => setCategory(option.value)}
                >
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>

          <ToggleButtonGroup
            aria-label="Search result layout"
            value={[viewMode]}
          >
            <ToggleButton
              value="grid"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              title="Grid view"
            >
              <GridIcon aria-hidden="true" />
            </ToggleButton>
            <ToggleButton
              value="list"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
            >
              <ListIcon aria-hidden="true" />
            </ToggleButton>
          </ToggleButtonGroup>
        </div>
      </FilterHeader>

      <span className={styles.visuallyHidden} aria-live="polite" role="status">
        {statusAnnouncement}
      </span>

      <main
        ref={resultsRef}
        className={styles.results}
        aria-busy={search.isPending && !!query}
      >
        <PageCapacityMeter
          viewMode={viewMode}
          gridRef={capacityGridRef}
          rowRef={capacityRowRef}
          headerRef={capacityHeaderRef}
        />
        {!query ? (
          <SearchState
            title="Start with a title, person, or genre"
            description="Use the search field in the top bar to search media across your libraries."
            actionLabel="Open search"
            onAction={focusSearch}
          />
        ) : search.isError ? (
          <SearchState
            tone="error"
            title="Search could not be loaded"
            description="The request failed. Try it again without changing your search."
            actionLabel="Retry"
            loading={search.isFetching}
            onAction={() => void search.refetch()}
          />
        ) : viewMode === 'grid' ? (
          search.isPending ? (
            <GridSkeleton count={pageSize ?? 0} />
          ) : items.length === 0 ? (
            <NoResults
              query={query}
              category={category}
              onClearCategory={() => setCategory('')}
              onSearchAgain={focusSearch}
            />
          ) : (
            <div className={styles.grid}>
              {items.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          )
        ) : search.isPending ? (
          <ListSkeleton count={pageSize ?? 0} />
        ) : items.length === 0 ? (
          <NoResults
            query={query}
            category={category}
            onClearCategory={() => setCategory('')}
            onSearchAgain={focusSearch}
          />
        ) : (
          <SearchResultTable items={items} />
        )}
      </main>

      <PaginationCapacityMeter footerRef={capacityFooterRef} />

      {query && !search.isPending && !search.isError && totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Search result pages">
          <Button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <PreviousIcon aria-hidden="true" />
            Previous
          </Button>
          <span className={styles.pageInfo} aria-current="page">
            Page {page} of {totalPages}
          </span>
          <Button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next
            <NextIcon aria-hidden="true" />
          </Button>
        </nav>
      )}
    </Page>
  )
}

function PageCapacityMeter({
  viewMode,
  gridRef,
  rowRef,
  headerRef,
}: {
  viewMode: 'grid' | 'list'
  gridRef: RefObject<HTMLDivElement | null>
  rowRef: RefObject<HTMLElement | null>
  headerRef: RefObject<HTMLTableSectionElement | null>
}) {
  if (viewMode === 'list') {
    return (
      <div
        className={`${styles.tableWrapper} ${styles.capacityMeter}`}
        aria-hidden="true"
      >
        <table className={styles.table}>
          <SearchTableHead sectionRef={headerRef} />
          <tbody>
            <tr
              ref={(element) => {
                rowRef.current = element
              }}
              className={styles.capacityTableRow}
            >
              <td colSpan={7} />
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div
      ref={gridRef}
      className={`${styles.grid} ${styles.capacityMeter}`}
      aria-hidden="true"
    >
      {CAPACITY_PROBES.map((key, index) => (
        <div
          key={key}
          ref={
            index === 0
              ? (element) => {
                  rowRef.current = element
                }
              : undefined
          }
        >
          <Card>
            <Card.Thumb />
            <Card.Info>
              <Card.Title>Page capacity</Card.Title>
              <Card.Meta>0000</Card.Meta>
            </Card.Info>
          </Card>
        </div>
      ))}
    </div>
  )
}

function PaginationCapacityMeter({
  footerRef,
}: {
  footerRef: RefObject<HTMLElement | null>
}) {
  return (
    <nav
      ref={(element) => {
        footerRef.current = element
      }}
      className={`${styles.pagination} ${styles.capacityFooter}`}
      aria-hidden="true"
    >
      <Button>
        <PreviousIcon aria-hidden="true" />
        Previous
      </Button>
      <span className={styles.pageInfo}>Page 1 of 1</span>
      <Button>
        Next
        <NextIcon aria-hidden="true" />
      </Button>
    </nav>
  )
}

function GridSkeleton({ count }: { count: number }) {
  return (
    <div
      className={styles.grid}
      aria-label="Loading search results"
      role="status"
    >
      {Array.from({ length: count }, (_, index) => `grid-${index}`).map(
        (key) => (
          <div className={styles.skeletonCard} key={key}>
            <Skeleton aspectRatio="5 / 7" />
            <Skeleton className={styles.skeletonTitle} />
          </div>
        ),
      )}
    </div>
  )
}

function ListSkeleton({ count }: { count: number }) {
  return (
    <div
      className={styles.tableWrapper}
      aria-label="Loading search results"
      role="status"
    >
      <table className={styles.table}>
        <SearchTableHead />
        <tbody>
          {Array.from({ length: count }, (_, index) => `list-${index}`).map(
            (key) => (
              <tr key={key} className={styles.skeletonRow}>
                <td colSpan={7}>
                  <Skeleton className={styles.skeletonLine} />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

function SearchResultTable({ items }: { items: MediaItem[] }) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <SearchTableHead />
        <tbody>
          {items.map((item) => (
            <MediaCard key={item.id} item={item} listView />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SearchTableHead({
  sectionRef,
}: {
  sectionRef?: RefObject<HTMLTableSectionElement | null>
} = {}) {
  return (
    <thead ref={sectionRef}>
      <tr>
        <th className={styles.thumbnailColumn} aria-label="Artwork" />
        <th scope="col">Title</th>
        <th scope="col">Duration</th>
        <th scope="col">Size</th>
        <th scope="col">Year</th>
        <th scope="col">Date added</th>
        <th aria-label="Actions" />
      </tr>
    </thead>
  )
}

function NoResults({
  query,
  category,
  onClearCategory,
  onSearchAgain,
}: {
  query: string
  category: string
  onClearCategory: () => void
  onSearchAgain: () => void
}) {
  const categoryLabel = MEDIA_CATEGORIES.find(
    (option) => option.value === category,
  )?.label

  return (
    <SearchState
      title={`No results for “${query}”`}
      description={
        categoryLabel
          ? `Nothing in ${categoryLabel.toLocaleLowerCase()} matched this search. Clear the filter to search every media type.`
          : 'Try another title, person, genre, or keyword.'
      }
      actionLabel={categoryLabel ? 'Clear filter' : 'Search again'}
      onAction={categoryLabel ? onClearCategory : onSearchAgain}
    />
  )
}

function SearchState({
  title,
  description,
  actionLabel,
  tone,
  loading,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  tone?: 'error'
  loading?: boolean
  onAction: () => void
}) {
  return (
    <section
      className={styles.state}
      {...(tone === 'error' ? { role: 'alert' } : {})}
    >
      <span className={styles.stateIcon}>
        <SearchIcon aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Button loading={loading} onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  )
}

function parseCountHeader(value: string | null, fallback: number, minimum = 0) {
  if (value === null) return fallback
  const count = Number(value)
  return Number.isInteger(count) && count >= minimum ? count : fallback
}

function getSearchStats({
  query,
  page,
  totalCount,
  totalPages,
  isPending,
  hasError,
}: {
  query: string
  page: number
  totalCount: number
  totalPages: number
  isPending: boolean
  hasError: boolean
}) {
  if (!query) return ['Search across every library']
  if (isPending) return [`Results for “${query}”`, 'Searching…']
  if (hasError) return [`Results for “${query}”`, 'Search unavailable']

  return [
    `Results for “${query}”`,
    `${totalCount.toLocaleString()} ${totalCount === 1 ? 'result' : 'results'}`,
    ...(totalPages > 1 ? [`Page ${page} of ${totalPages}`] : []),
  ]
}
