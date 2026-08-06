import { useVirtualizer } from '@tanstack/react-virtual'
import { Fragment, useEffect, useRef } from 'react'
import styles from '../../Library.module.css'
import { useScrollViewport } from '../hooks/useScrollViewport'
import type {
  CollectionViewProps,
  ListColumn,
  ListRowProps,
  SortDirection,
} from '../types/collectionView'

const ESTIMATED_ROW_HEIGHT = 64

type ListViewProps<Item, SortKey extends string> = CollectionViewProps<Item> & {
  columns: readonly ListColumn<SortKey>[]
  sortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
  renderRow: (item: Item, rowProps: ListRowProps) => React.ReactNode
}

export default function ListView<Item, SortKey extends string>({
  isLoading,
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  resetKey,
  getItemKey,
  emptyContent = 'No items in this library yet.',
  columns,
  sortKey,
  sortDirection,
  onSort,
  renderRow,
}: ListViewProps<Item, SortKey>) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const previousResetKey = useRef(resetKey)
  const { initialOffset, scrollElement, scrollMargin } =
    useScrollViewport(wrapperRef)
  const rowCount = items.length + (hasNextPage ? 1 : 0)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    initialOffset,
    scrollMargin,
    directDomUpdates: true,
    useFlushSync: false,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const lastVirtualRowIndex = virtualRows.at(-1)?.index
  const isVirtualized = !isLoading && items.length > 0

  useEffect(() => {
    if (previousResetKey.current !== resetKey) {
      scrollElement?.scrollTo({ top: 0 })
      previousResetKey.current = resetKey
    }
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
            {columns.map((column) => (
              <ListHeader
                key={column.key}
                column={column}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody
          ref={isVirtualized ? rowVirtualizer.containerRef : undefined}
          className={isVirtualized ? styles.virtualTableBody : undefined}
        >
          {isLoading ? (
            Array.from({ length: 10 }).map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable loading placeholders
              <SkeletonRow key={index} columnCount={columns.length} />
            ))
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.emptyCell}>
                {emptyContent}
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
                    <td colSpan={columns.length} className={styles.loadingMore}>
                      {isFetchingNextPage ? 'Loading more…' : 'Load more'}
                    </td>
                  </tr>
                )
              }

              const item = items[virtualRow.index]
              if (!item) return null

              return (
                <Fragment key={getItemKey(item)}>
                  {renderRow(item, {
                    ref: rowVirtualizer.measureElement,
                    'data-index': virtualRow.index,
                    style: rowStyle,
                  })}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function SkeletonRow({ columnCount }: { columnCount: number }) {
  return (
    <tr className={styles.skeletonRow ?? ''}>
      <td colSpan={columnCount}>
        <div className={styles.skeletonLine ?? ''} />
      </td>
    </tr>
  )
}

type ListHeaderProps<SortKey extends string> = {
  column: ListColumn<SortKey>
  sortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
}

function ListHeader<SortKey extends string>({
  column,
  sortKey,
  sortDirection,
  onSort,
}: ListHeaderProps<SortKey>) {
  const isActive = column.sortKey === sortKey

  if (!column.sortKey) {
    return <th style={{ width: column.width }}>{column.label}</th>
  }

  return (
    <th
      style={{ width: column.width }}
      aria-sort={
        isActive
          ? sortDirection === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => onSort(column.sortKey as SortKey)}
      >
        {column.label}
        {isActive && (
          <span className={styles.sortArrow} aria-hidden="true">
            {sortDirection === 'asc' ? ' ▲' : ' ▼'}
          </span>
        )}
      </button>
    </th>
  )
}
