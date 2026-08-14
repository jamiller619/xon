import {
  CheckmarkCircle24Filled as SelectBoxCheckedIcon,
  Circle24Regular as SelectBoxIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '~/store/appStore'
import { createCardHoldGesture } from './cardPressGesture'

const CLICK_SUPPRESSION_TIMEOUT_MS = 1000
const HOLD_IGNORED_TARGETS = [
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[data-card-hold-ignore]',
].join(',')

const styles = css`
  .selectContainer {
    position: relative;
    padding-block-start: var(--space-xs);

    .selectBox {
      position: absolute;
      top: 0;
      left: calc(0px - var(--space-xs));
      z-index: 1;
      color: var(--color-accent-9);
      background: var(--color-gray-2);
      border-radius: 1000px;
      width: 1.5rem;
      height: 1.5rem;
    }
  }

  .selected {
    a {
      img {
        filter: none !important;
      }

      div:first-child {
        outline: 3px solid var(--color-accent-9);
        outline-offset: -3px;
      }

      &:hover {
        div:first-child {
          transform: none;
        }
      }
    }
  }

  .selectContainer.pressed {
    a > div:first-child,
    a:hover > div:first-child {
      transform: scale(0.99);
    }
  }
`

type SelectWrapperProps = {
  id: string
  children: (
    onOpen: ((item: MediaItem, event?: React.MouseEvent) => void) | undefined,
  ) => React.ReactNode
}

export default function SelectWrapper({ id, children }: SelectWrapperProps) {
  const isSelectMode = useAppStore(({ isSelectMode }) => isSelectMode)
  const selectedItems = useAppStore(({ selectedItems }) => selectedItems)
  const setSelectedItems = useAppStore(
    ({ setSelectedItems }) => setSelectedItems,
  )
  const startSelection = useAppStore(({ startSelection }) => startSelection)
  const [isPressed, setIsPressed] = useState(false)
  const startSelectionRef = useRef(startSelection)
  const idRef = useRef(id)
  const gestureIdRef = useRef(id)
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const gestureRef = useRef<ReturnType<typeof createCardHoldGesture> | null>(
    null,
  )

  startSelectionRef.current = startSelection
  idRef.current = id

  if (gestureRef.current === null) {
    gestureRef.current = createCardHoldGesture({
      onActivate: () => startSelectionRef.current(idRef.current),
      onPressedChange: setIsPressed,
    })
  }

  const gesture = gestureRef.current
  const isSelected = selectedItems.includes(id)

  function clearClickSuppression() {
    suppressClickRef.current = false
    if (suppressClickTimerRef.current === null) return

    clearTimeout(suppressClickTimerRef.current)
    suppressClickTimerRef.current = null
  }

  function suppressNextClick() {
    clearClickSuppression()
    suppressClickRef.current = true
    suppressClickTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false
      suppressClickTimerRef.current = null
    }, CLICK_SUPPRESSION_TIMEOUT_MS)
  }

  function isIgnoredHoldTarget(target: EventTarget | null) {
    return target instanceof Element && target.closest(HOLD_IGNORED_TARGETS)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    clearClickSuppression()

    if (
      isSelectMode ||
      event.defaultPrevented ||
      !event.isPrimary ||
      event.button !== 0 ||
      isIgnoredHoldTarget(event.target)
    ) {
      return
    }

    gesture.start({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!gesture.isActive(event.pointerId)) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const isOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom

    if (isOutside) {
      gesture.cancel(event.pointerId)
      return
    }

    gesture.move({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const result = gesture.release(event.pointerId)
    if (!result.handled) return

    if (result.suppressClick) suppressNextClick()
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    gesture.abort(event.pointerId)
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    gesture.cancel(event.pointerId)
  }

  function handleLostPointerCapture(event: React.PointerEvent<HTMLDivElement>) {
    gesture.cancel(event.pointerId)
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return

    clearClickSuppression()
    event.preventDefault()
    event.stopPropagation()
  }

  function handleContextMenuCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!gesture.isActive()) return

    event.preventDefault()
    event.stopPropagation()
  }

  function handleTouchStartCapture(event: React.TouchEvent<HTMLDivElement>) {
    if (
      isSelectMode ||
      event.touches.length !== 1 ||
      isIgnoredHoldTarget(event.target)
    ) {
      return
    }

    // Base UI's ContextMenu also owns a 500 ms touch hold. Stop only that
    // eligible touch-start path so selection has deterministic ownership.
    event.stopPropagation()
  }

  useEffect(() => {
    if (!isPressed) return

    function handleScroll() {
      gesture.cancel()
    }

    function handleWindowBlur() {
      gesture.cancel()
    }

    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [gesture, isPressed])

  useEffect(() => {
    if (isSelectMode && gesture.phase() !== 'activated') gesture.abort()
  }, [gesture, isSelectMode])

  useEffect(() => {
    if (gestureIdRef.current === id) return

    gesture.abort()
    gestureIdRef.current = id
  }, [gesture, id])

  useEffect(
    () => () => {
      gesture.destroy()
      suppressClickRef.current = false
      if (suppressClickTimerRef.current !== null) {
        clearTimeout(suppressClickTimerRef.current)
      }
    },
    [gesture],
  )

  function handleSelect(_: MediaItem, event?: React.MouseEvent) {
    event?.preventDefault()

    setSelectedItems(
      isSelected
        ? selectedItems.filter((selectedItem) => selectedItem !== id)
        : [...selectedItems, id],
    )
  }

  return (
    <div
      className={clsx(styles.selectContainer, {
        [styles.selected as string]: isSelectMode && isSelected,
        [styles.pressed as string]: isPressed,
      })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onLostPointerCapture={handleLostPointerCapture}
      onClickCapture={handleClickCapture}
      onContextMenuCapture={handleContextMenuCapture}
      onTouchStartCapture={handleTouchStartCapture}
    >
      {isSelectMode && (
        <div className={styles.selectBox} aria-hidden="true">
          {isSelected ? <SelectBoxCheckedIcon /> : <SelectBoxIcon />}
        </div>
      )}
      {children(isSelectMode ? handleSelect : undefined)}
    </div>
  )
}
