import { type RefObject, useLayoutEffect, useState } from 'react'

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
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const viewport = findScrollViewport(element)
    setScrollElement(viewport)
    if (!viewport) return

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
    window.addEventListener('resize', updateMargin)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateMargin)
    }
  }, [ref])

  return { scrollElement, scrollMargin }
}
