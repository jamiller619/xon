export const CARD_HOLD_DURATION_MS = 500
export const CARD_HOLD_MOVEMENT_THRESHOLD_PX = 8

type CardHoldPointer = {
  pointerId: number
  clientX: number
  clientY: number
}

type CardHoldPhase = 'pending' | 'activated' | 'cancelled'

type ActiveCardHold = CardHoldPointer & {
  phase: CardHoldPhase
}

type CardHoldGestureOptions = {
  onActivate: () => void
  onPressedChange: (pressed: boolean) => void
}

export type CardHoldRelease = {
  handled: boolean
  suppressClick: boolean
}

export type CardHoldGesture = {
  start: (pointer: CardHoldPointer) => void
  move: (pointer: CardHoldPointer) => boolean
  cancel: (pointerId?: number) => boolean
  abort: (pointerId?: number) => boolean
  release: (pointerId: number) => CardHoldRelease
  isActive: (pointerId?: number) => boolean
  phase: () => CardHoldPhase | null
  destroy: () => void
}

export function createCardHoldGesture({
  onActivate,
  onPressedChange,
}: CardHoldGestureOptions): CardHoldGesture {
  let activeHold: ActiveCardHold | null = null
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let isPressed = false

  function clearHoldTimer() {
    if (holdTimer === null) return

    clearTimeout(holdTimer)
    holdTimer = null
  }

  function setPressed(pressed: boolean) {
    if (isPressed === pressed) return

    isPressed = pressed
    onPressedChange(pressed)
  }

  function reset() {
    clearHoldTimer()
    activeHold = null
    setPressed(false)
  }

  function matchesPointer(pointerId?: number) {
    return (
      activeHold !== null &&
      (pointerId === undefined || activeHold.pointerId === pointerId)
    )
  }

  return {
    start(pointer) {
      reset()
      activeHold = { ...pointer, phase: 'pending' }
      setPressed(true)

      holdTimer = setTimeout(() => {
        holdTimer = null
        if (activeHold?.phase !== 'pending') return

        activeHold.phase = 'activated'
        onActivate()
      }, CARD_HOLD_DURATION_MS)
    },

    move(pointer) {
      const currentHold = activeHold
      if (
        !matchesPointer(pointer.pointerId) ||
        currentHold === null ||
        currentHold.phase === 'cancelled'
      ) {
        return false
      }

      const deltaX = pointer.clientX - currentHold.clientX
      const deltaY = pointer.clientY - currentHold.clientY
      const movementSquared = deltaX * deltaX + deltaY * deltaY
      const thresholdSquared = CARD_HOLD_MOVEMENT_THRESHOLD_PX ** 2

      if (movementSquared <= thresholdSquared) return false

      clearHoldTimer()
      currentHold.phase = 'cancelled'
      setPressed(false)
      return true
    },

    cancel(pointerId) {
      const currentHold = activeHold
      if (
        !matchesPointer(pointerId) ||
        currentHold === null ||
        currentHold.phase === 'cancelled'
      ) {
        return false
      }

      clearHoldTimer()
      currentHold.phase = 'cancelled'
      setPressed(false)
      return true
    },

    abort(pointerId) {
      if (!matchesPointer(pointerId)) return false

      reset()
      return true
    },

    release(pointerId) {
      if (!matchesPointer(pointerId) || activeHold === null) {
        return { handled: false, suppressClick: false }
      }

      const suppressClick = activeHold.phase !== 'pending'
      reset()

      return { handled: true, suppressClick }
    },

    isActive(pointerId) {
      return matchesPointer(pointerId)
    },

    phase() {
      return activeHold?.phase ?? null
    },

    destroy() {
      reset()
    },
  }
}
