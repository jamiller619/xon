import { type RefObject, useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const scrollPositions = new Map<string, number>()

function findScrollViewport(element: HTMLElement) {
  let parent = element.parentElement

  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }

  return null
}

export function useScrollViewport(ref: RefObject<HTMLElement | null>) {
  const { key: locationKey } = useLocation()
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const viewport = findScrollViewport(element)
    setScrollElement(viewport)
    if (!viewport) return

    const savedPosition = scrollPositions.get(locationKey)
    let positionRestored = savedPosition === undefined

    const restorePosition = () => {
      if (positionRestored || savedPosition === undefined) return

      viewport.scrollTop = savedPosition
      positionRestored = Math.abs(viewport.scrollTop - savedPosition) < 1
    }

    const updateMargin = () => {
      setScrollMargin(
        element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop,
      )
      restorePosition()
    }

    updateMargin()
    const observer = new ResizeObserver(updateMargin)
    observer.observe(element)
    observer.observe(viewport)
    window.addEventListener('resize', updateMargin)

    return () => {
      if (positionRestored) {
        scrollPositions.set(locationKey, viewport.scrollTop)
      }
      observer.disconnect()
      window.removeEventListener('resize', updateMargin)
    }
  }, [locationKey, ref])

  return { scrollElement, scrollMargin }
}
