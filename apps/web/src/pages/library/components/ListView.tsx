import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import MediaCard from '~/components/media-card/MediaCard'
import { useScrollViewport } from '../hooks/useScrollViewport'
import styles from '../Library.module.css'
import type { SortColumn, SortDir } from './libraryControls'
import type { ViewProps } from './types'

const COLUMN_COUNT = 7
const ESTIMATED_ROW_HEIGHT = 64

type ListViewProps = ViewProps & {
  sortCol: SortColumn
  sortDir: SortDir
  onSort: (column: SortColumn) => void
}

export default function ListView({
  isLoading,
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  resetKey,
  sortCol,
  sortDir,
  onSort,
}: ListViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { scrollElement, scrollMargin } = useScrollViewport(wrapperRef)
  const rowCount = items.length + (hasNextPage ? 1 : 0)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    scrollMargin,
    directDomUpdates: true,
    useFlushSync: false,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const lastVirtualRowIndex = virtualRows.at(-1)?.index
  const isVirtualized = !isLoading && items.length > 0

  useEffect(() => {
    if (resetKey) scrollElement?.scrollTo({ top: 0 })
  }, [resetKey, scrollElement])

  useEffect(() => {
    if (
      lastVirtualRowIndex !== undefined &&
      lastVirtualRowIndex >= items.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onLoadMore()
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    items.length,
    lastVirtualRowIndex,
    onLoadMore,
  ])

  return (
    <div ref={wrapperRef} className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thThumb} />
            <SortableHeader column="title" {...{ sortCol, sortDir, onSort }}>
              Title
            </SortableHeader>
            <th>Duration</th>
            <SortableHeader column="fileSize" {...{ sortCol, sortDir, onSort }}>
              File Size
            </SortableHeader>
            <th>Release Date</th>
            <SortableHeader
              column="createdAt"
              {...{ sortCol, sortDir, onSort }}
            >
              Date Added
            </SortableHeader>
            <th className={styles.thActions}>Actions</th>
          </tr>
        </thead>
        <tbody
          ref={isVirtualized ? rowVirtualizer.containerRef : undefined}
          className={isVirtualized ? styles.virtualTableBody : undefined}
        >
          {isLoading ? (
            Array.from({ length: 10 }).map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <SkeletonRow key={index} />
            ))
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className={styles.emptyCell}>
                No media in this library yet.
              </td>
            </tr>
          ) : (
            virtualRows.map((virtualRow) => {
              const rowStyle = {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                display: 'table',
                tableLayout: 'fixed',
              } as const

              if (virtualRow.index === items.length) {
                return (
                  <tr
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={rowStyle}
                  >
                    <td colSpan={COLUMN_COUNT} className={styles.loadingMore}>
                      {isFetchingNextPage ? 'Loading more…' : 'Load more'}
                    </td>
                  </tr>
                )
              }

              const item = items[virtualRow.index]
              if (!item) return null

              return (
                <MediaCard
                  key={item.id}
                  item={item}
                  listView
                  listRowProps={{
                    ref: rowVirtualizer.measureElement,
                    'data-index': virtualRow.index,
                    style: rowStyle,
                  }}
                />
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className={styles.skeletonRow ?? ''}>
      <td colSpan={COLUMN_COUNT}>
        <div className={styles.skeletonLine ?? ''} />
      </td>
    </tr>
  )
}

type SortableHeaderProps = {
  column: SortColumn
  sortCol: SortColumn
  sortDir: SortDir
  onSort: (column: SortColumn) => void
  children: React.ReactNode
}

function SortableHeader({
  column,
  sortCol,
  sortDir,
  onSort,
  children,
}: SortableHeaderProps) {
  const isActive = column === sortCol

  return (
    <th
      aria-sort={
        isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => onSort(column)}
      >
        {children}
        {isActive && (
          <span className={styles.sortArrow} aria-hidden="true">
            {sortDir === 'asc' ? ' ▲' : ' ▼'}
          </span>
        )}
      </button>
    </th>
  )
}
