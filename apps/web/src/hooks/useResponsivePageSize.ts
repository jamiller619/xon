import { type RefObject, useLayoutEffect, useState } from 'react'
import { findScrollViewport } from '~/lib/scrollViewport'

type PageSizeMeasurements = {
  availableHeight: number
  columns: number
  headerHeight?: number
  maxPageSize?: number
  minPageSize?: number
  rowGap: number
  rowHeight: number
}

export function calculateResponsivePageSize({
  availableHeight,
  columns,
  headerHeight = 0,
  maxPageSize = 100,
  minPageSize = 20,
  rowGap,
  rowHeight,
}: PageSizeMeasurements) {
  const usableHeight = Math.max(0, availableHeight - headerHeight)
  const fittingRows = Math.max(
    1,
    Math.floor((usableHeight + rowGap) / (rowHeight + rowGap)),
  )
  const safeColumns = Math.max(1, columns)
  const minimumRows = Math.max(1, Math.ceil(minPageSize / safeColumns))
  const maximumRows = Math.max(1, Math.floor(maxPageSize / safeColumns))
  const rows = Math.min(Math.max(fittingRows, minimumRows), maximumRows)

  return safeColumns * rows
}

type ResponsivePageSizeOptions = {
  containerRef: RefObject<HTMLElement | null>
  footerRef: RefObject<HTMLElement | null>
  getColumnCount: () => number
  getRowGap: () => number
  headerRef?: RefObject<HTMLElement | null>
  rowRef: RefObject<HTMLElement | null>
}

export function useResponsivePageSize({
  containerRef,
  footerRef,
  getColumnCount,
  getRowGap,
  headerRef,
  rowRef,
}: ResponsivePageSizeOptions) {
  const [pageSize, setPageSize] = useState<number | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const footer = footerRef.current
    const row = rowRef.current
    if (!container || !footer || !row) return

    const viewport = findScrollViewport(container)
    if (!viewport) return

    let updateFrame: number | undefined
    const update = () => {
      if (updateFrame !== undefined) cancelAnimationFrame(updateFrame)
      updateFrame = requestAnimationFrame(() => {
        const viewportRect = viewport.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const containerOffset =
          containerRect.top - viewportRect.top + viewport.scrollTop
        const containerParentStyle = getComputedStyle(
          container.parentElement ?? container,
        )
        const pageGap = Number.parseFloat(containerParentStyle.rowGap)
        const pagePaddingEnd = Number.parseFloat(
          containerParentStyle.paddingBlockEnd,
        )
        const availableHeight =
          viewport.clientHeight -
          containerOffset -
          footer.offsetHeight -
          (Number.isFinite(pageGap) ? pageGap : 0) -
          (Number.isFinite(pagePaddingEnd) ? pagePaddingEnd : 0)
        const nextPageSize = calculateResponsivePageSize({
          availableHeight,
          columns: getColumnCount(),
          headerHeight: headerRef?.current?.offsetHeight ?? 0,
          rowGap: getRowGap(),
          rowHeight: row.offsetHeight,
        })

        setPageSize((current) =>
          current === nextPageSize ? current : nextPageSize,
        )
        updateFrame = undefined
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    observer.observe(footer)
    observer.observe(row)
    observer.observe(viewport)
    if (headerRef?.current) observer.observe(headerRef.current)
    window.addEventListener('resize', update)

    return () => {
      if (updateFrame !== undefined) cancelAnimationFrame(updateFrame)
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [containerRef, footerRef, getColumnCount, getRowGap, headerRef, rowRef])

  return pageSize
}
