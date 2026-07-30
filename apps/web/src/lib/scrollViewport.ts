export function findScrollViewport(element: HTMLElement) {
  let parent = element.parentElement

  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }

  return null
}
