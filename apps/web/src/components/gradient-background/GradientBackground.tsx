import clsx from 'clsx'
import { type CSSProperties, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './GradientBackground.module.css'

export interface GradientBackgroundProps {
  /**
   * Stacking order of the background layer. Default `-1` so it sits behind the
   * page content. (Page content should keep a transparent/`auto` background for
   * the gradient — and whatever is behind it — to show through.)
   */
  zIndex?: number
  /** Render into a custom element instead of `document.body`. */
  container?: HTMLElement | null
  /** Extra class applied to the gradient layer. */
  className?: string
}

/**
 * Full-page diagonal gradient background.
 *
 * Renders a single absolutely-positioned layer (portaled onto `document.body`
 * by default) that spans the entire document. The gradient runs from fully
 * transparent at the top-left to solid `--color-gray-1` at the bottom-right.
 *
 * Because the layer is `position: absolute` rather than `fixed`, it scrolls
 * with the window: as the user scrolls down the page they move into the solid
 * `--color-gray-1` region, and scrolling back up reveals the transparency
 * again (letting anything behind the page — e.g. a background slideshow — show
 * through near the top).
 */
export function GradientBackground({
  zIndex = -1,
  container,
  className,
}: GradientBackgroundProps) {
  const [mounted, setMounted] = useState(false)

  // Client-only mount — avoids SSR/hydration mismatch for the portal.
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const host = container ?? document.body
  const style: CSSProperties = { zIndex }

  return createPortal(
    <div
      className={clsx(styles.gradient, className)}
      style={style}
      aria-hidden="true"
    />,
    host,
  )
}
