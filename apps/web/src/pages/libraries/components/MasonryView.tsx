import { useVirtualizer } from '@tanstack/react-virtual'
import { css } from 'inline-css-modules'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useScrollViewport } from '../hooks/useScrollViewport'
import styles from '../Library.module.css'
import type { CollectionViewProps } from '../types/collectionView'
import SkeletonCard from './SkeletonCard'

const DEFAULT_MIN_ITEM_WIDTH = 180
const DEFAULT_GAP = 12
const DEFAULT_ASPECT_RATIO = 4 / 3
const DEFAULT_SKELETON_COUNT = 24

const masonryStyles = css`
  /* Hallmark · pre-emit critique: P4 H5 E4 S5 R5 V4
   * existing LibraryView system · tone: utilitarian · structure: virtual masonry
   */
  .masonry {
    position: relative;
    min-width: 0;
    contain: layout style;
  }

  .item {
    position: absolute;
    top: 0;
  }

  .skeletons {
    columns: 180px;
    column-gap: var(--space-sm);
  }

  .skeleton {
    break-inside: avoid;
    margin-block-end: var(--space-sm);
  }

  .loader {
    margin: 0;
    padding-block: var(--space-md);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }
`

type MasonryViewProps<Item> = CollectionViewProps<Item> & {
  renderItem: (item: Item) => React.ReactNode
  getItemAspectRatio: (item: Item) => number | undefined
  renderSkeleton?: (index: number) => React.ReactNode
  minItemWidth?: number
  gap?: number
  skeletonCount?: number
}

export default function MasonryView<Item>({
  isLoading,
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  resetKey,
  getItemKey,
  emptyContent = 'No items in this library yet.',
  renderItem,
  getItemAspectRatio,
  renderSkeleton = (index) => (
    <SkeletonCard aspectRatio={index % 3 === 0 ? '3 / 4' : '4 / 3'} />
  ),
  minItemWidth = DEFAULT_MIN_ITEM_WIDTH,
  gap = DEFAULT_GAP,
  skeletonCount = DEFAULT_SKELETON_COUNT,
}: MasonryViewProps<Item>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const { initialOffset, scrollElement, scrollMargin } =
    useScrollViewport(containerRef)
  const columns = Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)))
  const itemWidth =
    width > 0 ? (width - gap * (columns - 1)) / columns : minItemWidth

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
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => {
      const item = items[index]
      const aspectRatio = item ? getItemAspectRatio(item) : undefined
      return itemWidth / (aspectRatio || DEFAULT_ASPECT_RATIO)
    },
    getItemKey: (index) => {
      const item = items[index]
      return item ? getItemKey(item) : index
    },
    lanes: columns,
    gap,
    overscan: columns * 2,
    initialOffset,
    scrollMargin,
    directDomUpdates: true,
    useFlushSync: false,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualItemIndex = virtualItems.at(-1)?.index

  // Card widths change at responsive breakpoints, so cached item measurements
  // must be rebuilt even when the item data itself is unchanged.
  // biome-ignore lint/correctness/useExhaustiveDependencies: columns and itemWidth intentionally trigger remeasurement
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [columns, itemWidth, virtualizer])

  useEffect(() => {
    if (previousResetKey.current !== resetKey) {
      scrollElement?.scrollTo({ top: 0 })
      previousResetKey.current = resetKey
    }
  }, [resetKey, scrollElement])

  useEffect(() => {
    if (
      lastVirtualItemIndex !== undefined &&
      lastVirtualItemIndex >= items.length - columns &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onLoadMore()
    }
  }, [
    columns,
    hasNextPage,
    isFetchingNextPage,
    items.length,
    lastVirtualItemIndex,
    onLoadMore,
  ])

  if (isLoading) {
    return (
      <div ref={containerRef} className={masonryStyles.skeletons}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: stable loading placeholders
            key={index}
            className={masonryStyles.skeleton}
          >
            {renderSkeleton(index)}
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div ref={containerRef} className={masonryStyles.masonry}>
        <p className={styles.empty}>{emptyContent}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={masonryStyles.masonry}>
      <div ref={virtualizer.containerRef}>
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]
          if (!item) return null

          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className={masonryStyles.item}
              style={{
                left: virtualItem.lane * (itemWidth + gap),
                width: itemWidth,
              }}
            >
              {renderItem(item)}
            </div>
          )
        })}
      </div>
      {hasNextPage && (
        <p className={masonryStyles.loader}>
          {isFetchingNextPage ? 'Loading more…' : 'Load more'}
        </p>
      )}
    </div>
  )
}
