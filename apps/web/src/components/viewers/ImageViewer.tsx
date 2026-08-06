import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '~/lib/apiFetch'
import styles from './ImageViewer.module.css'

export interface ImageSibling {
  id: string
  title: string
  thumbnailSrc: string | undefined
}

interface ImageViewerProps {
  mediaId: string
  title: string
  onClose: () => void
  siblings?: ImageSibling[]
  onCurrentIndexChange?: ((index: number) => void) | undefined
}

const MIN_SCALE = 1
const MAX_SCALE = 8
const SLIDESHOW_INTERVAL_MS = 4000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function ImageViewer({
  mediaId,
  title,
  onClose,
  siblings,
  onCurrentIndexChange,
}: ImageViewerProps) {
  // Find starting index in siblings list
  const startIndex = siblings
    ? Math.max(
        0,
        siblings.findIndex((s) => s.id === mediaId),
      )
    : 0
  const [currentIndex, setCurrentIndex] = useState(startIndex)

  const currentId =
    siblings && siblings.length > 0
      ? (siblings[currentIndex]?.id ?? mediaId)
      : mediaId
  const currentTitle =
    siblings && siblings.length > 0
      ? (siblings[currentIndex]?.title ?? title)
      : title

  const [scale, setScale] = useState(1)
  const [translateX, setTranslateX] = useState(0)
  const [translateY, setTranslateY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [slideshowActive, setSlideshowActive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const containerRef = useRef<HTMLElement>(null)
  const dragStart = useRef<{
    x: number
    y: number
    tx: number
    ty: number
  } | null>(null)
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([])

  const hasSiblings = siblings && siblings.length > 1
  const canGoPrev = hasSiblings && currentIndex > 0
  const canGoNext = hasSiblings && currentIndex < (siblings?.length ?? 1) - 1

  const resetTransform = useCallback(() => {
    setScale(1)
    setTranslateX(0)
    setTranslateY(0)
  }, [])

  const selectImage = useCallback(
    (index: number) => {
      setCurrentIndex(index)
      resetTransform()
      setLoaded(false)
      setLoadError(false)
    },
    [resetTransform],
  )

  const goNext = useCallback(() => {
    if (!canGoNext) return
    selectImage(currentIndex + 1)
  }, [canGoNext, currentIndex, selectImage])

  const goPrev = useCallback(() => {
    if (!canGoPrev) return
    selectImage(currentIndex - 1)
  }, [canGoPrev, currentIndex, selectImage])

  useEffect(() => {
    thumbnailRefs.current[currentIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
    onCurrentIndexChange?.(currentIndex)
  }, [currentIndex, onCurrentIndexChange])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          goNext()
          break
        case ' ':
          e.preventDefault()
          if (hasSiblings) setSlideshowActive((a) => !a)
          break
        default:
          break
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goNext, goPrev, hasSiblings])

  // Slideshow timer
  useEffect(() => {
    if (!slideshowActive || !hasSiblings) return
    const timer = setInterval(goNext, SLIDESHOW_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [slideshowActive, hasSiblings, goNext])

  // Mouse wheel zoom
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setScale((s) => {
      const newScale = clamp(s * factor, MIN_SCALE, MAX_SCALE)
      // When zooming back to 1, reset translation
      if (newScale === MIN_SCALE) {
        setTranslateX(0)
        setTranslateY(0)
      }
      return newScale
    })
  }

  // Mouse drag pan
  function handleMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return
    e.preventDefault()
    setDragging(true)
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      tx: translateX,
      ty: translateY,
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging || !dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setTranslateX(dragStart.current.tx + dx)
    setTranslateY(dragStart.current.ty + dy)
  }

  function handleMouseUp() {
    setDragging(false)
    dragStart.current = null
  }

  // Touch events for pinch-zoom and pan
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      if (!t1 || !t2) return
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      pinchRef.current = { dist, scale }
    } else if (e.touches.length === 1 && scale > 1) {
      const t = e.touches[0]
      if (!t) return
      dragStart.current = {
        x: t.clientX,
        y: t.clientY,
        tx: translateX,
        ty: translateY,
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 2 && pinchRef.current) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      if (!t1 || !t2) return
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const newScale = clamp(
        pinchRef.current.scale * (dist / pinchRef.current.dist),
        MIN_SCALE,
        MAX_SCALE,
      )
      setScale(newScale)
      if (newScale === MIN_SCALE) {
        setTranslateX(0)
        setTranslateY(0)
      }
    } else if (e.touches.length === 1 && dragStart.current && scale > 1) {
      const t = e.touches[0]
      if (!t) return
      const dx = t.clientX - dragStart.current.x
      const dy = t.clientY - dragStart.current.y
      setTranslateX(dragStart.current.tx + dx)
      setTranslateY(dragStart.current.ty + dy)
    }
  }

  function handleTouchEnd() {
    pinchRef.current = null
    dragStart.current = null
  }

  return (
    <dialog open className={styles.overlay ?? ''} aria-label="Image viewer">
      {/* Top bar */}
      <div className={styles.topBar ?? ''}>
        <span className={styles.imageTitle ?? ''}>{currentTitle}</span>
        <div className={styles.topBarActions ?? ''}>
          {hasSiblings && (
            <button
              type="button"
              className={`${styles.controlBtn ?? ''} ${slideshowActive ? (styles.controlBtnActive ?? '') : ''}`}
              onClick={() => setSlideshowActive((a) => !a)}
              title={slideshowActive ? 'Stop slideshow' : 'Start slideshow'}
            >
              {slideshowActive ? '⏸ Pause' : '▶ Slideshow'}
            </button>
          )}
          {scale > 1 && (
            <button
              type="button"
              className={styles.controlBtn ?? ''}
              onClick={resetTransform}
              title="Reset zoom"
            >
              ⌂ Reset
            </button>
          )}
          <button
            type="button"
            className={styles.closeBtn ?? ''}
            onClick={onClose}
            title="Close viewer (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Image area */}
      <section
        ref={containerRef}
        aria-label="Zoomable image"
        className={`${styles.imageContainer ?? ''} ${dragging ? (styles.dragging ?? '') : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {!loaded && !loadError && <div className={styles.spinner ?? ''} />}
        {loadError && (
          <p className={styles.loadError ?? ''}>Unable to load this photo.</p>
        )}
        <img
          key={currentId}
          src={apiUrl(`/api/media/${currentId}/stream`)}
          alt={currentTitle}
          className={styles.image ?? ''}
          style={{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            opacity: loaded ? 1 : 0,
          }}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setLoadError(true)}
        />
      </section>

      {/* Navigation buttons */}
      {hasSiblings && (
        <>
          <button
            type="button"
            className={`${styles.navBtn ?? ''} ${styles.navPrev ?? ''}`}
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label="Previous image"
            title="Previous image (←)"
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.navBtn ?? ''} ${styles.navNext ?? ''}`}
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="Next image"
            title="Next image (→)"
          >
            ›
          </button>
          <nav className={styles.filmstrip ?? ''} aria-label="Photo thumbnails">
            {siblings?.map((sibling, index) => (
              <button
                key={sibling.id}
                ref={(element) => {
                  thumbnailRefs.current[index] = element
                }}
                type="button"
                className={`${styles.thumbnail ?? ''} ${index === currentIndex ? (styles.thumbnailActive ?? '') : ''}`}
                onClick={() => selectImage(index)}
                aria-label={`View ${sibling.title}`}
                aria-current={index === currentIndex ? 'true' : undefined}
                title={sibling.title}
              >
                {sibling.thumbnailSrc ? (
                  <img src={sibling.thumbnailSrc} alt="" loading="lazy" />
                ) : (
                  <span aria-hidden="true" />
                )}
              </button>
            ))}
            <div className={styles.counter ?? ''}>
              {currentIndex + 1} / {siblings?.length ?? 1}
            </div>
          </nav>
        </>
      )}
    </dialog>
  )
}
