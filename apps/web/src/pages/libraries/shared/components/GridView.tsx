import { useVirtualizer } from '@tanstack/react-virtual'
import { css } from 'inline-css-modules'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from '../../Library.module.css'
import { useScrollViewport } from '../hooks/useScrollViewport'
import type { CollectionViewProps } from '../types/collectionView'
import SkeletonCard from './SkeletonCard'

const DEFAULT_MIN_CARD_WIDTH = 160
const DEFAULT_GAP = 12
const DEFAULT_CARD_HEIGHT_RATIO = 7 / 5
const DEFAULT_CARD_INFO_HEIGHT = 64
const DEFAULT_SKELETON_COUNT = 40

const gridStyles = css`
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-sm);
  }

  .virtualGrid {
    position: relative;
    min-width: 0;
    contain: layout style;
  }

  .virtualRow {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    width: 100%;
    gap: var(--space-sm);
  }

  .loader {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }
`

type GridViewProps<Item> = CollectionViewProps<Item> & {
  renderItem: (item: Item) => React.ReactNode
  renderSkeleton?: (index: number) => React.ReactNode
  minCardWidth?: number
  gap?: number
  cardHeightRatio?: number
  cardInfoHeight?: number
  skeletonCount?: number
}

export default function GridView<Item>({
  isLoading,
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  resetKey,
  getItemKey,
  emptyContent = 'No items in this library yet.',
  renderItem,
  renderSkeleton = () => <SkeletonCard />,
  minCardWidth = DEFAULT_MIN_CARD_WIDTH,
  gap = DEFAULT_GAP,
  cardHeightRatio = DEFAULT_CARD_HEIGHT_RATIO,
  cardInfoHeight = DEFAULT_CARD_INFO_HEIGHT,
  skeletonCount = DEFAULT_SKELETON_COUNT,
}: GridViewProps<Item>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const { initialOffset, scrollElement, scrollMargin } =
    useScrollViewport(containerRef)
  const columns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)))
  const itemRowCount = Math.ceil(items.length / columns)
  const rowCount = itemRowCount + (hasNextPage ? 1 : 0)
  const cardWidth = (width - gap * (columns - 1)) / columns
  const estimatedRowHeight =
    Math.max(minCardWidth, cardWidth) * cardHeightRatio + cardInfoHeight

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => setWidth(container.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const previousResetKey = useRef(resetKey)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimatedRowHeight,
    gap,
    overscan: 2,
    initialOffset,
    scrollMargin,
    directDomUpdates: true,
    useFlushSync: false,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const lastVirtualRowIndex = virtualRows.at(-1)?.index

  useEffect(() => {
    if (previousResetKey.current !== resetKey) {
      scrollElement?.scrollTo({ top: 0 })
      previousResetKey.current = resetKey
    }
  }, [resetKey, scrollElement])

  useEffect(() => {
    if (
      lastVirtualRowIndex !== undefined &&
      lastVirtualRowIndex >= itemRowCount - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onLoadMore()
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    itemRowCount,
    lastVirtualRowIndex,
    onLoadMore,
  ])

  if (isLoading) {
    return (
      <div ref={containerRef} className={gridStyles.virtualGrid}>
        <div
          className={gridStyles.grid}
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`,
            gap,
          }}
        >
          {Array.from({ length: skeletonCount }).map((_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable loading placeholders
            <Fragment key={index}>{renderSkeleton(index)}</Fragment>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div ref={containerRef} className={gridStyles.virtualGrid}>
        <p className={styles.empty}>{emptyContent}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={gridStyles.virtualGrid}>
      <div ref={rowVirtualizer.containerRef}>
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns
          const rowItems = items.slice(startIndex, startIndex + columns)

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className={gridStyles.virtualRow}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap,
              }}
            >
              {rowItems.map((item) => (
                <Fragment key={getItemKey(item)}>{renderItem(item)}</Fragment>
              ))}
              {virtualRow.index === itemRowCount && (
                <div
                  className={gridStyles.loader}
                  style={{ gridColumn: `1 / ${columns + 1}` }}
                >
                  {isFetchingNextPage ? 'Loading more…' : 'Load more'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
