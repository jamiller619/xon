import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ImageViewer.module.css'

export interface ImageSibling {
  id: string
  title: string
}

interface ImageViewerProps {
  mediaId: string
  title: string
  onClose: () => void
  siblings?: ImageSibling[]
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

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{
    x: number
    y: number
    tx: number
    ty: number
  } | null>(null)
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)

  const hasSiblings = siblings && siblings.length > 1

  const resetTransform = useCallback(() => {
    setScale(1)
    setTranslateX(0)
    setTranslateY(0)
  }, [])

  const goNext = useCallback(() => {
    if (!hasSiblings) return
    setCurrentIndex((i) => (i + 1) % (siblings?.length ?? 1))
    resetTransform()
    setLoaded(false)
  }, [hasSiblings, siblings?.length, resetTransform])

  const goPrev = useCallback(() => {
    if (!hasSiblings) return
    setCurrentIndex(
      (i) => (i - 1 + (siblings?.length ?? 1)) % (siblings?.length ?? 1),
    )
    resetTransform()
    setLoaded(false)
  }, [hasSiblings, siblings?.length, resetTransform])

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
      <div
        ref={containerRef}
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
        {!loaded && <div className={styles.spinner ?? ''} />}
        <img
          key={currentId}
          src={`/api/media/${currentId}/stream`}
          alt={currentTitle}
          className={styles.image ?? ''}
          style={{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            opacity: loaded ? 1 : 0,
          }}
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
      </div>

      {/* Navigation buttons */}
      {hasSiblings && (
        <>
          <button
            type="button"
            className={`${styles.navBtn ?? ''} ${styles.navPrev ?? ''}`}
            onClick={goPrev}
            title="Previous image (←)"
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.navBtn ?? ''} ${styles.navNext ?? ''}`}
            onClick={goNext}
            title="Next image (→)"
          >
            ›
          </button>
          <div className={styles.counter ?? ''}>
            {currentIndex + 1} / {siblings?.length ?? 1}
          </div>
        </>
      )}
    </dialog>
  )
}
