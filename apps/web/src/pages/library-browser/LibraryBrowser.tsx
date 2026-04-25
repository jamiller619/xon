import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BulkEditDialog from '~/components/group-dialog/BulkEditDialog'
import GroupDialog from '~/components/group-dialog/GroupDialog'
import MediaCard, {
  type MediaCardItem,
} from '~/components/media-card/MediaCard'
import { apiFetch } from '~/lib/apiFetch'
import { useAppStore } from '~/store/appStore'
import styles from './LibraryBrowser.module.css'

interface Library {
  id: string
  name: string
}

interface Group {
  id: string
  type: string
  title: string
}

type TabMode = 'media' | 'groups'

type SortColumn =
  | 'title'
  | 'mediaCategory'
  | 'fileSize'
  | 'createdAt'
  | 'releaseDate'
  | 'rating'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 40

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

const SORT_OPTIONS: { label: string; col: SortColumn; dir: SortDir }[] = [
  { label: 'Date Added (newest)', col: 'createdAt', dir: 'desc' },
  { label: 'Date Added (oldest)', col: 'createdAt', dir: 'asc' },
  { label: 'Title A→Z', col: 'title', dir: 'asc' },
  { label: 'Title Z→A', col: 'title', dir: 'desc' },
  { label: 'File Size (largest)', col: 'fileSize', dir: 'desc' },
  { label: 'File Size (smallest)', col: 'fileSize', dir: 'asc' },
  { label: 'Release Date (newest)', col: 'releaseDate', dir: 'desc' },
  { label: 'Rating (highest)', col: 'rating', dir: 'desc' },
]

function makeSortKey(col: SortColumn, dir: SortDir): string {
  return `${col}:${dir}`
}

function SkeletonCard() {
  return <div className={styles.skeletonCard ?? ''} />
}

function SkeletonRow() {
  return (
    <tr className={styles.skeletonRow ?? ''}>
      <td colSpan={5}>
        <div className={styles.skeletonLine ?? ''} />
      </td>
    </tr>
  )
}

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>()
  const { viewMode, setViewMode } = useAppStore()
  const [library, setLibrary] = useState<Library | null>(null)
  const [items, setItems] = useState<MediaCardItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortColumn>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterCategory, setFilterCategory] = useState('')
  const [tab, setTab] = useState<TabMode>('media')
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDialog, setShowBulkDialog] = useState(false)

  useEffect(() => {
    if (!id) return
    apiFetch(`/api/v1/libraries/${id}`)
      .then((r) => r.json())
      .then((lib) => setLibrary(lib as Library))
      .catch(() => setError('Failed to load library'))
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    const apiSortBy = sortCol === 'mediaCategory' ? 'createdAt' : sortCol
    const params = new URLSearchParams({
      order: sortDir,
      sortBy: apiSortBy,
      limit: String(PAGE_SIZE),
      page: String(page),
    })
    if (filterCategory) params.set('mediaCategory', filterCategory)
    apiFetch(`/api/v1/libraries/${id}/media?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const mediaList = data as MediaCardItem[]
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
  }, [id, page, sortCol, sortDir, filterCategory])

  const loadGroups = useCallback(() => {
    if (!id) return
    setGroupsLoading(true)
    apiFetch(`/api/v1/groups?libraryId=${id}`)
      .then((r) => r.json())
      .then((data) => setGroups(data as Group[]))
      .catch(() => {
        /* ignore */
      })
      .finally(() => setGroupsLoading(false))
  }, [id])

  useEffect(() => {
    if (tab === 'groups') loadGroups()
  }, [tab, loadGroups])

  function handleGroupCreated(group: Group) {
    setShowGroupDialog(false)
    setGroups((prev) => [...prev, group])
  }

  function toggleSelectMode() {
    setSelectMode((prev) => !prev)
    setSelectedIds(new Set())
  }

  function toggleSelectItem(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(items.map((item) => item.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function handleBulkDone() {
    setShowBulkDialog(false)
    setSelectMode(false)
    setSelectedIds(new Set())
    // Reload items
    setPage(1)
    setTotalPages(1)
  }

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(1)
  }

  function handleSortOption(value: string) {
    const opt = SORT_OPTIONS.find((o) => makeSortKey(o.col, o.dir) === value)
    if (opt) {
      setSortCol(opt.col)
      setSortDir(opt.dir)
      setPage(1)
    }
  }

  function handleCategoryFilter(value: string) {
    setFilterCategory(value)
    setPage(1)
    setTotalPages(1)
  }

  function sortIndicator(col: SortColumn) {
    if (col !== sortCol) return null
    return (
      <span className={styles.sortArrow ?? ''}>
        {sortDir === 'asc' ? ' ▲' : ' ▼'}
      </span>
    )
  }

  const currentSortKey = makeSortKey(sortCol, sortDir)

  const activeFilters: { key: string; label: string; onRemove: () => void }[] =
    []
  if (filterCategory) {
    activeFilters.push({
      key: 'category',
      label: `Category: ${filterCategory}`,
      onRemove: () => handleCategoryFilter(''),
    })
  }

  if (error) {
    return <div className={styles.error ?? ''}>{error}</div>
  }

  return (
    <div className={styles.browser ?? ''}>
      <header className={styles.header ?? ''}>
        <h1 className={styles.title ?? ''}>{library?.name ?? 'Library'}</h1>
        <div className={styles.viewToggle ?? ''}>
          <button
            type="button"
            className={`${styles.toggleBtn ?? ''} ${selectMode ? (styles.toggleActive ?? '') : ''}`}
            onClick={toggleSelectMode}
            title="Toggle selection mode"
          >
            ☑
          </button>
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

      {/* Tab strip */}
      <div className={styles.tabs ?? ''}>
        <button
          type="button"
          className={`${styles.tab ?? ''} ${tab === 'media' ? (styles.tabActive ?? '') : ''}`}
          onClick={() => setTab('media')}
        >
          Media
        </button>
        <button
          type="button"
          className={`${styles.tab ?? ''} ${tab === 'groups' ? (styles.tabActive ?? '') : ''}`}
          onClick={() => setTab('groups')}
        >
          Groups
        </button>
      </div>

      {tab === 'groups' && (
        <div className={styles.groupsSection ?? ''}>
          <div className={styles.groupsHeader ?? ''}>
            <span className={styles.groupsCount ?? ''}>
              {groups.length} group{groups.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className={styles.newGroupBtn ?? ''}
              onClick={() => setShowGroupDialog(true)}
            >
              + New Group
            </button>
          </div>
          {groupsLoading && (
            <p className={styles.groupsLoading ?? ''}>Loading…</p>
          )}
          {!groupsLoading && groups.length === 0 && (
            <p className={styles.groupsEmpty ?? ''}>
              No groups yet. Create one to get started.
            </p>
          )}
          {!groupsLoading && groups.length > 0 && (
            <div className={styles.groupGrid ?? ''}>
              {groups.map((g) => (
                <Link
                  key={g.id}
                  to={`/groups/${g.id}`}
                  className={styles.groupCard ?? ''}
                >
                  <span className={styles.groupTypeLabel ?? ''}>
                    {g.type.charAt(0).toUpperCase() + g.type.slice(1)}
                  </span>
                  <span className={styles.groupTitle ?? ''}>{g.title}</span>
                </Link>
              ))}
            </div>
          )}
          {showGroupDialog && (
            <GroupDialog
              libraryId={id ?? ''}
              onCreated={handleGroupCreated}
              onClose={() => setShowGroupDialog(false)}
            />
          )}
        </div>
      )}

      {tab === 'media' && (
        <>
          {/* Filter bar */}
          <div className={styles.filterBar ?? ''}>
            <div className={styles.filterGroup ?? ''}>
              <label
                className={styles.filterLabel ?? ''}
                htmlFor="filter-category"
              >
                Category
              </label>
              <select
                id="filter-category"
                className={styles.filterSelect ?? ''}
                value={filterCategory}
                onChange={(e) => handleCategoryFilter(e.target.value)}
              >
                <option value="">All</option>
                {MEDIA_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup ?? ''}>
              <label className={styles.filterLabel ?? ''} htmlFor="filter-sort">
                Sort
              </label>
              <select
                id="filter-sort"
                className={styles.filterSelect ?? ''}
                value={currentSortKey}
                onChange={(e) => handleSortOption(e.target.value)}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option
                    key={makeSortKey(opt.col, opt.dir)}
                    value={makeSortKey(opt.col, opt.dir)}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup ?? ''}>
              <label
                className={styles.filterLabel ?? ''}
                htmlFor="filter-genre"
              >
                Genre
              </label>
              <select
                id="filter-genre"
                className={`${styles.filterSelect ?? ''} ${styles.filterDisabled ?? ''}`}
                disabled
              >
                <option value="">All</option>
              </select>
            </div>

            <div className={styles.filterGroup ?? ''}>
              <label className={styles.filterLabel ?? ''} htmlFor="filter-year">
                Year
              </label>
              <select
                id="filter-year"
                className={`${styles.filterSelect ?? ''} ${styles.filterDisabled ?? ''}`}
                disabled
              >
                <option value="">All</option>
              </select>
            </div>

            <div className={styles.filterGroup ?? ''}>
              <label
                className={styles.filterLabel ?? ''}
                htmlFor="filter-rating"
              >
                Rating
              </label>
              <select
                id="filter-rating"
                className={`${styles.filterSelect ?? ''} ${styles.filterDisabled ?? ''}`}
                disabled
              >
                <option value="">All</option>
              </select>
            </div>

            <div className={styles.filterGroup ?? ''}>
              <label className={styles.filterLabel ?? ''} htmlFor="filter-tags">
                Tags
              </label>
              <select
                id="filter-tags"
                className={`${styles.filterSelect ?? ''} ${styles.filterDisabled ?? ''}`}
                disabled
              >
                <option value="">All</option>
              </select>
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className={styles.chips ?? ''}>
              {activeFilters.map((f) => (
                <span key={f.key} className={styles.chip ?? ''}>
                  {f.label}
                  <button
                    type="button"
                    className={styles.chipRemove ?? ''}
                    onClick={f.onRemove}
                    aria-label={`Remove ${f.label} filter`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {activeFilters.length > 1 && (
                <button
                  type="button"
                  className={styles.clearAll ?? ''}
                  onClick={() => handleCategoryFilter('')}
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {selectMode && (
            <div className={styles.selectToolbar ?? ''}>
              <span className={styles.selectCount ?? ''}>
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                className={styles.selectBtn ?? ''}
                onClick={selectAll}
              >
                Select All
              </button>
              <button
                type="button"
                className={styles.selectBtn ?? ''}
                onClick={clearSelection}
              >
                Clear
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  className={styles.bulkEditBtn ?? ''}
                  onClick={() => setShowBulkDialog(true)}
                >
                  Edit {selectedIds.size} item
                  {selectedIds.size !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {viewMode === 'grid' ? (
            loading ? (
              <div className={styles.grid ?? ''}>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className={styles.empty ?? ''}>
                No media in this library yet.
              </p>
            ) : (
              <div className={styles.grid ?? ''}>
                {items.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    selectMode={selectMode}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={toggleSelectItem}
                  />
                ))}
              </div>
            )
          ) : (
            <div className={styles.tableWrapper ?? ''}>
              <table className={styles.table ?? ''}>
                <thead>
                  <tr>
                    {selectMode && (
                      <th
                        className={`${styles.th ?? ''} ${styles.thCheck ?? ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            selectedIds.size === items.length &&
                            items.length > 0
                          }
                          onChange={(e) =>
                            e.target.checked ? selectAll() : clearSelection()
                          }
                          title="Select all"
                        />
                      </th>
                    )}
                    <th
                      className={`${styles.th ?? ''} ${styles.thThumb ?? ''}`}
                    />
                    <th
                      className={`${styles.th ?? ''} ${styles.thSortable ?? ''}`}
                      onClick={() => handleSort('title')}
                      onKeyDown={(e) =>
                        (e.key === 'Enter' || e.key === ' ') &&
                        handleSort('title')
                      }
                    >
                      Title{sortIndicator('title')}
                    </th>
                    <th
                      className={`${styles.th ?? ''} ${styles.thSortable ?? ''}`}
                      onClick={() => handleSort('mediaCategory')}
                      onKeyDown={(e) =>
                        (e.key === 'Enter' || e.key === ' ') &&
                        handleSort('mediaCategory')
                      }
                    >
                      Category{sortIndicator('mediaCategory')}
                    </th>
                    <th
                      className={`${styles.th ?? ''} ${styles.thSortable ?? ''}`}
                      onClick={() => handleSort('fileSize')}
                      onKeyDown={(e) =>
                        (e.key === 'Enter' || e.key === ' ') &&
                        handleSort('fileSize')
                      }
                    >
                      Size{sortIndicator('fileSize')}
                    </th>
                    <th
                      className={`${styles.th ?? ''} ${styles.thSortable ?? ''}`}
                      onClick={() => handleSort('createdAt')}
                      onKeyDown={(e) =>
                        (e.key === 'Enter' || e.key === ' ') &&
                        handleSort('createdAt')
                      }
                    >
                      Date Added{sortIndicator('createdAt')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                      <SkeletonRow key={i} />
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell ?? ''}>
                        No media in this library yet.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <MediaCard
                        key={item.id}
                        item={item}
                        listView
                        selectMode={selectMode}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={toggleSelectItem}
                      />
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
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
      {showBulkDialog && (
        <BulkEditDialog
          selectedIds={[...selectedIds]}
          libraryId={id ?? ''}
          onDone={handleBulkDone}
          onClose={() => setShowBulkDialog(false)}
        />
      )}
    </div>
  )
}
