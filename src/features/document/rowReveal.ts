/**
 * The row whose controls are open, and the touch that opens them.
 *
 * A phone has room for the record and not for the record's controls, so on a
 * phone the controls are hidden until the row is opened — with a long press or
 * a swipe. One row at a time: two open rows would be two rows of buttons on a
 * screen that was hiding them because there was not room for them.
 *
 * Outside React, because the rows are two levels deep and a context would be
 * threading one piece of state through every level to say one thing. The store
 * is read through `useSyncExternalStore`, so a row re-renders when the open row
 * changes and not otherwise.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { usePhoneLayout } from '../../app/device'

/** How long a finger has to stay still to open a row. */
const LONG_PRESS_MS = 450

/** How far a finger has to move sideways to open a row. */
const SWIPE_PX = 40

/**
 * How far a finger may move before it is scrolling rather than pressing.
 *
 * Small, because a long press that survives a scroll would open rows while the
 * user is reading.
 */
const MOVE_TOLERANCE_PX = 10

let revealed: string | null = null
const listeners = new Set<() => void>()

/** The row that is open, or nothing. */
export function currentRevealedRow(): string | null {
  return revealed
}

/** Open a row, or close whatever is open by opening nothing. */
export function setRevealedRow(key: string | null): void {
  if (revealed === key) return
  revealed = key
  for (const listener of listeners) listener()
}

/** Whether this row is the open one. */
export function useRevealedRow(key: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  const getSnapshot = useCallback(() => revealed === key, [key])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * The touch handlers that open a row.
 *
 * Two ways in, because a long press and a swipe are different gestures and
 * people reach for different ones: a long press is deliberate and does not
 * fight with scrolling, and a swipe is quick and can be done while already
 * moving the finger.
 *
 * The touch handlers do nothing off a phone. On a laptop the controls are
 * always visible, and a long press there is a text selection.
 */
export function useRevealOnTouch(key: string): {
  revealed: boolean
  onTouchStart: (event: React.TouchEvent) => void
  onTouchMove: (event: React.TouchEvent) => void
  onTouchEnd: () => void
  onContextMenu: (event: React.MouseEvent) => void
} {
  const phone = usePhoneLayout()
  const revealed = useRevealedRow(key)
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (!phone) return
      const touch = event.touches[0]
      if (touch === undefined) return

      start.current = { x: touch.clientX, y: touch.clientY }

      // A touch elsewhere closes whatever was open: one open row is a thing,
      // and the user has moved on.
      const open = currentRevealedRow()
      if (open !== null && open !== key) setRevealedRow(null)

      cancel()
      timer.current = window.setTimeout(() => {
        setRevealedRow(key)
        timer.current = null
      }, LONG_PRESS_MS)
    },
    [phone, key, cancel],
  )

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (!phone || start.current === null) return
      const touch = event.touches[0]
      if (touch === undefined) return

      const dx = touch.clientX - start.current.x
      const dy = touch.clientY - start.current.y

      if (Math.abs(dx) > MOVE_TOLERANCE_PX || Math.abs(dy) > MOVE_TOLERANCE_PX) {
        // The finger has moved, so this is a scroll or a drag rather than a
        // press. The press is off; a sideways swipe is still a way in.
        cancel()
      }

      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        setRevealedRow(key)
        cancel()
      }
    },
    [phone, key, cancel],
  )

  const onTouchEnd = useCallback(() => {
    cancel()
    start.current = null
  }, [cancel])

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      // The platform's own long-press menu would sit over the row's controls on
      // a phone, and the press that opened them is the same press that brings
      // it up. On a laptop the menu is the user's own.
      if (!phone) return
      event.preventDefault()
    },
    [phone],
  )

  return { revealed, onTouchStart, onTouchMove, onTouchEnd, onContextMenu }
}
