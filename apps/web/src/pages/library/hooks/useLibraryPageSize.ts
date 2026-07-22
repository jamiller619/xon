import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const LIST_PAGE_SIZE = 40
const MIN_CARD_WIDTH = 160

type ViewMode = 'grid' | 'list'

type UseLibraryPageSizeOptions = {
  viewMode: ViewMode
  setPage: (page: number | ((currentPage: number) => number)) => void
}

export function useLibraryPageSize({
  viewMode,
  setPage,
}: UseLibraryPageSizeOptions) {
  const gridViewportRef = useRef<HTMLDivElement>(null)
  const previousPageSizeRef = useRef(LIST_PAGE_SIZE)
  const [gridPageSize, setGridPageSize] = useState(LIST_PAGE_SIZE)
  const pageSize = viewMode === 'grid' ? gridPageSize : LIST_PAGE_SIZE

  useLayoutEffect(() => {
    if (viewMode !== 'grid') return

    const gridViewport = gridViewportRef.current
    if (!gridViewport) return

    const updateGridPageSize = () => {
      const grid = gridViewport.firstElementChild
      if (!(grid instanceof HTMLElement)) return

      const gridStyles = getComputedStyle(grid)
      const gap = Number.parseFloat(gridStyles.columnGap) || 0
      const width = grid.clientWidth
      if (width <= 0) return

      const columns = Math.max(
        1,
        Math.floor((width + gap) / (MIN_CARD_WIDTH + gap)),
      )
      const rows = Math.max(1, Math.round(LIST_PAGE_SIZE / columns))

      setGridPageSize(columns * rows)
    }

    updateGridPageSize()

    const observer = new ResizeObserver(updateGridPageSize)
    observer.observe(gridViewport)

    return () => observer.disconnect()
  }, [viewMode])

  useEffect(() => {
    const previousPageSize = previousPageSizeRef.current
    if (previousPageSize === pageSize) return

    setPage(
      (page) => Math.floor(((page - 1) * previousPageSize) / pageSize) + 1,
    )
    previousPageSizeRef.current = pageSize
  }, [pageSize, setPage])

  return { gridViewportRef, pageSize }
}
