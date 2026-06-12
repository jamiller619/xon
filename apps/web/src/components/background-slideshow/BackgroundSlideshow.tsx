import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Full-viewport background image slideshow.
 *
 * Renders a fixed layer behind the page (portaled onto `document.body` by
 * default) and crossfades between images. It behaves exactly like a
 * `background-image` set on the body element (`cover` / `center`), but unlike a
 * single `background-image` property it can actually crossfade — each image is
 * its own layer and only opacity is transitioned.
 *
 * No animation library is required: the crossfade is a CSS `opacity`
 * transition, and the Ken Burns variant drives the active layer's transform
 * with the native Web Animations API.
 */

/** Props shared by both slideshow components. */
export interface BackgroundSlideshowProps {
  /** Image URLs to cycle through, in order. */
  images: string[]
  /**
   * How long each image stays fully visible before the next crossfade begins.
   * Default `12000` (12s).
   */
  intervalMs?: number
  /** Crossfade duration. Default `1500` (1.5s). */
  fadeMs?: number
  /**
   * Stacking order of the background layer. Default `-1` so it sits behind page
   * content, just like a body background. (Your app content should have a
   * transparent/`auto` background for the images to show through.)
   */
  zIndex?: number
  /** Color shown beneath the images, e.g. before the first one decodes. Default `"#000"`. */
  backgroundColor?: string
  /** Pause cycling while the browser tab is hidden (Page Visibility API). Default `true`. */
  pauseWhenHidden?: boolean
  /** Index of the first image shown. Default `0`. */
  startIndex?: number
  /** Render into a custom element instead of `document.body`. */
  container?: HTMLElement | null
}

/** Configuration for the continuous Ken Burns motion. */
export interface KenBurnsConfig {
  /** Maximum zoom at the end of the motion. `1` = no zoom. Default `1.08`. */
  zoom?: number
  /** Maximum pan distance as a fraction of the layer size. Default `0.04` (4%). */
  pan?: number
  /** CSS easing for the motion. Default `"ease-out"`. */
  easing?: string
}

interface InternalProps extends BackgroundSlideshowProps {
  /** When set, the active image slowly transforms (Ken Burns). */
  kenBurns?: KenBurnsConfig | false
}

function Slideshow({
  images,
  intervalMs = 12_000,
  fadeMs = 1_500,
  zIndex = -1,
  backgroundColor = '#000',
  pauseWhenHidden = true,
  startIndex = 0,
  container,
  kenBurns = false,
}: InternalProps) {
  const [mounted, setMounted] = useState(false)
  const [index, setIndex] = useState(() =>
    images.length ? clampIndex(startIndex, images.length) : 0,
  )
  const [paused, setPaused] = useState(false)
  const layerRefs = useRef<(HTMLDivElement | null)[]>([])

  // Client-only mount — avoids SSR/hydration mismatch for the portal.
  useEffect(() => setMounted(true), [])

  // Keep the active index valid if the image list shrinks/changes.
  useEffect(() => {
    setIndex((i) => (images.length ? clampIndex(i, images.length) : 0))
  }, [images.length])

  // Pause cycling while the tab is hidden.
  useEffect(() => {
    if (!pauseWhenHidden) return
    const sync = () => setPaused(document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [pauseWhenHidden])

  // Advance the active image on an interval.
  useEffect(() => {
    if (paused || images.length <= 1) return
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % images.length),
      intervalMs,
    )
    return () => window.clearInterval(id)
  }, [paused, images.length, intervalMs])

  // Ken Burns: drive the active layer's transform with the Web Animations API.
  useEffect(() => {
    if (!kenBurns) return
    const el = layerRefs.current[index]
    if (!el || typeof el.animate !== 'function') return

    // Restart this layer's motion (leave outgoing layers holding their
    // transform so the crossfade stays smooth). Cancel only the transform
    // (WAAPI) animations — `getAnimations()` also returns the CSS opacity
    // transition that drives the crossfade, and cancelling that would snap the
    // image to full opacity instead of fading it in.
    el.getAnimations()
      .filter((a) => !(a instanceof CSSTransition))
      .forEach((a) => void a.cancel())

    const { zoom = 1.08, pan = 0.04, easing = 'ease-out' } = kenBurns
    const [dx, dy] = panFor(index, pan)

    el.animate(
      [
        { transform: 'scale(1) translate(0%, 0%)' },
        { transform: `scale(${zoom}) translate(${dx}%, ${dy}%)` },
      ],
      { duration: intervalMs + fadeMs, easing, fill: 'forwards' },
    )
  }, [index, kenBurns, intervalMs, fadeMs])

  if (!mounted || images.length === 0) return null

  const host = container ?? document.body

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor,
  }

  return createPortal(
    <div style={wrapperStyle} aria-hidden="true">
      {images.map((src, i) => {
        const active = i === index
        const layerStyle: CSSProperties = {
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("${cssUrl(src)}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: active ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease-in-out`,
          willChange: 'opacity, transform',
        }
        return (
          <div
            key={`${i.toString()}-${src}`}
            ref={(node) => {
              layerRefs.current[i] = node
            }}
            style={layerStyle}
          />
        )
      })}
    </div>,
    host,
  )
}

/**
 * Background slideshow. Crossfades by default; pass `kenBurns` (a boolean or a
 * {@link KenBurnsConfig}) to also drive a subtle, continuous zoom/drift on the
 * active image.
 */
export function BackgroundSlideshow(
  props: BackgroundSlideshowProps & { kenBurns?: boolean | KenBurnsConfig },
) {
  const { kenBurns, ...rest } = props
  return (
    <Slideshow {...rest} kenBurns={kenBurns === true ? {} : (kenBurns ?? false)} />
  )
}

/**
 * Identical to {@link BackgroundSlideshow}, but the active image also performs a
 * very subtle, continuous Ken Burns motion (slow zoom + drift) after fading in.
 */
export function BackgroundSlideshowKenBurns(
  props: BackgroundSlideshowProps & { kenBurns?: KenBurnsConfig },
) {
  const { kenBurns, ...rest } = props
  return <Slideshow {...rest} kenBurns={kenBurns ?? {}} />
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

/** Wrap an arbitrary integer into a valid `[0, len)` index. */
function clampIndex(i: number, len: number): number {
  if (!Number.isFinite(i)) return 0
  return ((Math.trunc(i) % len) + len) % len
}

/** Escape characters that could break out of the CSS `url("...")` context. */
function cssUrl(src: string): string {
  return src.replace(/["\\]/g, '\\$&')
}

/** A small, deterministic set of subtle pan directions, varied per slide. */
function panFor(index: number, pan: number): [number, number] {
  const directions: Array<[number, number]> = [
    [0, 0], //      straight zoom
    [pan, 0], //    drift right
    [-pan, 0], //   drift left
    [0, pan], //    drift down
    [0, -pan], //   drift up
  ]

  const [x, y] = directions[index % directions.length] ?? [0, 0]

  return [x * 100, y * 100] // translate() takes percentages
}
