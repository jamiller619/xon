import { useVirtualizer } from '@tanstack/react-virtual'
import { css } from 'inline-css-modules'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import MediaCard from '~/components/media-card/MediaCard'
import { useScrollViewport } from '../hooks/useScrollViewport'
import libraryStyles from '../Library.module.css'
import SkeletonCard from './SkeletonCard'
import type { ViewProps } from './types'

const MIN_CARD_WIDTH = 160
const GRID_GAP = 12
const CARD_HEIGHT_RATIO = 7 / 5
const CARD_INFO_HEIGHT = 64
const INITIAL_ITEM_COUNT = 40

const styles = css`
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

export default function GridView({
  isLoading,
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  resetKey,
}: ViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const { scrollElement, scrollMargin } = useScrollViewport(containerRef)
  const columns = Math.max(
    1,
    Math.floor((width + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP)),
  )
  const mediaRowCount = Math.ceil(items.length / columns)
  const rowCount = mediaRowCount + (hasNextPage ? 1 : 0)
  const cardWidth = (width - GRID_GAP * (columns - 1)) / columns
  const estimatedRowHeight =
    Math.max(MIN_CARD_WIDTH, cardWidth) * CARD_HEIGHT_RATIO + CARD_INFO_HEIGHT

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
    gap: GRID_GAP,
    overscan: 2,
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
      lastVirtualRowIndex >= mediaRowCount - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onLoadMore()
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    lastVirtualRowIndex,
    mediaRowCount,
    onLoadMore,
  ])

  if (isLoading) {
    return (
      <div ref={containerRef} className={styles.virtualGrid}>
        <div className={styles.grid}>
          {Array.from({ length: INITIAL_ITEM_COUNT }).map((_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div ref={containerRef} className={styles.virtualGrid}>
        <p className={libraryStyles.empty}>No media in this library yet.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={styles.virtualGrid}>
      <div ref={rowVirtualizer.containerRef}>
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns
          const rowItems = items.slice(startIndex, startIndex + columns)

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className={styles.virtualRow}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {rowItems.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
              {virtualRow.index === mediaRowCount && (
                <div
                  className={styles.loader}
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
