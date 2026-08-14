import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_HOLD_DURATION_MS,
  CARD_HOLD_MOVEMENT_THRESHOLD_PX,
  createCardHoldGesture,
} from './cardPressGesture'

function setupGesture() {
  const onActivate = vi.fn()
  const onPressedChange = vi.fn()
  const gesture = createCardHoldGesture({ onActivate, onPressedChange })

  return { gesture, onActivate, onPressedChange }
}

describe('card press-and-hold gesture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a quick release as an unsuppressed click', () => {
    const { gesture, onActivate, onPressedChange } = setupGesture()

    gesture.start({ pointerId: 1, clientX: 10, clientY: 10 })
    vi.advanceTimersByTime(CARD_HOLD_DURATION_MS - 1)

    expect(gesture.release(1)).toEqual({
      handled: true,
      suppressClick: false,
    })
    expect(onActivate).not.toHaveBeenCalled()
    expect(onPressedChange.mock.calls).toEqual([[true], [false]])

    vi.advanceTimersByTime(1)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('activates at 500 ms and stays pressed until release', () => {
    const { gesture, onActivate, onPressedChange } = setupGesture()

    gesture.start({ pointerId: 7, clientX: 20, clientY: 30 })
    vi.advanceTimersByTime(CARD_HOLD_DURATION_MS - 1)

    expect(gesture.phase()).toBe('pending')
    expect(onActivate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(gesture.phase()).toBe('activated')
    expect(onActivate).toHaveBeenCalledOnce()
    expect(onPressedChange.mock.calls).toEqual([[true]])
    expect(gesture.release(7)).toEqual({
      handled: true,
      suppressClick: true,
    })
    expect(onPressedChange.mock.calls).toEqual([[true], [false]])
  })

  it('allows exactly 8 px of movement and cancels beyond it', () => {
    const { gesture, onActivate, onPressedChange } = setupGesture()

    gesture.start({ pointerId: 3, clientX: 0, clientY: 0 })

    expect(
      gesture.move({
        pointerId: 3,
        clientX: CARD_HOLD_MOVEMENT_THRESHOLD_PX,
        clientY: 0,
      }),
    ).toBe(false)
    expect(
      gesture.move({
        pointerId: 3,
        clientX: CARD_HOLD_MOVEMENT_THRESHOLD_PX + 0.01,
        clientY: 0,
      }),
    ).toBe(true)

    expect(gesture.phase()).toBe('cancelled')
    expect(onPressedChange.mock.calls).toEqual([[true], [false]])
    expect(gesture.release(3)).toEqual({
      handled: true,
      suppressClick: true,
    })

    vi.advanceTimersByTime(CARD_HOLD_DURATION_MS)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('ignores movement and release from another pointer', () => {
    const { gesture, onActivate, onPressedChange } = setupGesture()

    gesture.start({ pointerId: 2, clientX: 0, clientY: 0 })

    expect(gesture.move({ pointerId: 9, clientX: 100, clientY: 100 })).toBe(
      false,
    )
    expect(gesture.release(9)).toEqual({
      handled: false,
      suppressClick: false,
    })

    vi.advanceTimersByTime(CARD_HOLD_DURATION_MS)
    expect(onActivate).toHaveBeenCalledOnce()
    expect(onPressedChange.mock.calls).toEqual([[true]])
  })

  it('cancels a pending hold but suppresses its eventual release click', () => {
    const { gesture, onActivate, onPressedChange } = setupGesture()

    gesture.start({ pointerId: 4, clientX: 0, clientY: 0 })

    expect(gesture.cancel(4)).toBe(true)
    expect(gesture.phase()).toBe('cancelled')
    expect(gesture.release(4)).toEqual({
      handled: true,
      suppressClick: true,
    })
    expect(onPressedChange.mock.calls).toEqual([[true], [false]])

    vi.runAllTimers()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('aborts without leaving an active pointer or delayed timer', () => {
    const { gesture, onActivate, onPressedChange } = setupGesture()

    gesture.start({ pointerId: 5, clientX: 0, clientY: 0 })

    expect(gesture.abort(5)).toBe(true)
    expect(gesture.phase()).toBeNull()
    expect(gesture.release(5)).toEqual({
      handled: false,
      suppressClick: false,
    })
    expect(onPressedChange.mock.calls).toEqual([[true], [false]])

    vi.runAllTimers()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('clears the pressed state if movement occurs after activation', () => {
    const { gesture, onActivate, onPressedChange } = setupGesture()

    gesture.start({ pointerId: 6, clientX: 0, clientY: 0 })
    vi.advanceTimersByTime(CARD_HOLD_DURATION_MS)

    expect(
      gesture.move({
        pointerId: 6,
        clientX: CARD_HOLD_MOVEMENT_THRESHOLD_PX + 1,
        clientY: 0,
      }),
    ).toBe(true)
    expect(onActivate).toHaveBeenCalledOnce()
    expect(onPressedChange.mock.calls).toEqual([[true], [false]])
    expect(gesture.release(6).suppressClick).toBe(true)
  })
})
