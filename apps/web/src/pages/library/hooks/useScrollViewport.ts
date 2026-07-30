import { type RefObject, useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { findScrollViewport } from '~/lib/scrollViewport'

const scrollPositions = new Map<string, number>()

export function useScrollViewport(ref: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation()
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const initialOffset = scrollPositions.get(pathname) ?? 0

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const viewport = findScrollViewport(element)
    setScrollElement(viewport)
    if (!viewport) return

    let saveFrame: number | undefined

    const savePosition = () => {
      if (saveFrame !== undefined) cancelAnimationFrame(saveFrame)
      saveFrame = requestAnimationFrame(() => {
        scrollPositions.set(pathname, viewport.scrollTop)
        saveFrame = undefined
      })
    }

    const updateMargin = () => {
      setScrollMargin(
        element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop,
      )
    }

    updateMargin()
    const observer = new ResizeObserver(updateMargin)
    observer.observe(element)
    observer.observe(viewport)
    viewport.addEventListener('scroll', savePosition, { passive: true })
    window.addEventListener('resize', updateMargin)

    return () => {
      if (saveFrame !== undefined) cancelAnimationFrame(saveFrame)
      observer.disconnect()
      viewport.removeEventListener('scroll', savePosition)
      window.removeEventListener('resize', updateMargin)
    }
  }, [pathname, ref])

  return { initialOffset, scrollElement, scrollMargin }
}
