import {
  ChevronLeft20Filled as LeftIcon,
  ChevronRight20Filled as RightIcon,
} from '@fluentui/react-icons'
import clsx from 'clsx'
import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import Button from '../button/Button.jsx'
import styles from './XScroller.module.css'

type ScrollerCtx = {
  viewportRef: RefObject<HTMLDivElement | null>
  canScrollPrev: boolean
  canScrollNext: boolean
  scrollPrev: () => void
  scrollNext: () => void
}

const Ctx = createContext<ScrollerCtx | null>(null)

function useScrollerCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('XScroller.* must be used inside <XScroller>')

  return ctx
}

export default function XScroller({ children }: PropsWithChildren) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const update = () => {
      setCanScrollPrev(el.scrollLeft > 0)
      setCanScrollNext(
        Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth,
      )
    }

    update()

    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const scroll = (dir: 1 | -1) => {
    if (!viewportRef.current) return

    viewportRef.current.scrollBy({
      left: dir * viewportRef.current.clientWidth,
      behavior: 'smooth',
    })
  }

  return (
    <Ctx.Provider
      value={{
        viewportRef,
        scrollPrev: () => scroll(-1),
        scrollNext: () => scroll(1),
        canScrollPrev,
        canScrollNext,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

XScroller.Viewport = function Viewport({
  children,
  className,
}: {
  children: ReactNode
  className?: string | undefined
}) {
  const { viewportRef, canScrollPrev, canScrollNext } = useScrollerCtx()

  return (
    <div
      className={clsx(styles.viewport, {
        [styles.fadeLeft as string]: canScrollPrev,
        [styles.fadeRight as string]: canScrollNext,
      })}
    >
      <div ref={viewportRef} className={styles.content}>
        <div className={clsx(styles.row, className)}>{children}</div>
      </div>
    </div>
  )
}

XScroller.ButtonPrev = function PrevButton() {
  const { canScrollPrev, scrollPrev } = useScrollerCtx()

  return (
    <Button size="small" onClick={scrollPrev} disabled={!canScrollPrev}>
      <LeftIcon />
    </Button>
  )
}

XScroller.ButtonNext = function NextButton() {
  const { canScrollNext, scrollNext } = useScrollerCtx()

  return (
    <Button size="small" onClick={scrollNext} disabled={!canScrollNext}>
      <RightIcon />
    </Button>
  )
}
