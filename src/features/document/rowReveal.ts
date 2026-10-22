/**
 * Which rows have their controls showing, and the touch that shows them.
 *
 * A phone has room for the record and not for the record's controls, so on a
 * phone the controls are hidden until they are asked for. There are two things
 * a user can mean by asking, and they are different:
 *
 * - *this row* — a swipe sideways. Quick, local, and about the row under the
 *   finger: "open this one, I am about to use it". It closes as soon as the
 *   finger touches anything else.
 * - *every row* — a long press. Deliberate, and what a user does when they are
 *   about to rearrange things rather than use one record. It is a mode, not a
 *   moment, so it stays until it is switched off with the control that appears
 *   while it is on — the next touch elsewhere must not close it, because the
 *   user is in the middle of working through the page.
 *
 * The two are one piece of state because they are one answer to "what is
 * showing": a row is showing if every row is, or if it is the open one.
 *
 * Outside React, because the rows are two levels deep and a context would be
 * threading one piece of state through every level to say one thing. The store
 * is read through `useSyncExternalStore`, so a row re-renders when what is
 * showing changes and not otherwise.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { usePhoneLayout } from '../../app/device'

/** How long a finger has to stay still to open every row. */
const LONG_PRESS_MS = 450

/** How far a finger has to move sideways to open one row. */
const SWIPE_PX = 40

/**
 * How far a finger may move before it is scrolling rather than pressing.
 *
 * Small, because a long press that survives a scroll would open rows while the
 * user is reading.
 */
const MOVE_TOLERANCE_PX = 10

/** Whether every row is showing its controls. */
let everyRow = false

/** The one row that is showing its controls, when not every row is. */
let openRow: string | null = null

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Show or hide the controls on every row.
 *
 * Turning the mode on closes the single open row: it is the weaker of the two
 * answers, and leaving it marked would mean a row that stays open after the
 * mode is switched off — which is not something the user asked for.
 */
export function setEveryRow(next: boolean): void {
  if (everyRow === next) return
  everyRow = next
  if (next) openRow = null
  notify()
}

/** Show the controls on one row, or close the open one with `null`. */
export function setOpenRow(key: string | null): void {
  if (openRow === key) return
  openRow = key
  notify()
}

/** Whether every row is showing its controls. */
export function useEveryRow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => everyRow,
    () => false,
  )
}

/** Whether this row is showing its controls. */
export function useRevealedRow(key: string): boolean {
  const getSnapshot = useCallback(() => everyRow || openRow === key, [key])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/**
 * Close the open row when the finger touches something else.
 *
 * The single row is a mode of one gesture: the user swiped because they wanted
 * that row, and the moment they touch anywhere else they have moved on. The
 * touch that opened it is inside the row, so a touch inside the open row —
 * aimed at one of its buttons — is not "somewhere else" and does not close it.
 *
 * Every-row mode is deliberately not closed by this: it is switched off by the
 * control that appears while it is on, which is reachable from anywhere on the
 * page.
 */
export function useCloseOpenRowOnTouchElsewhere(): void {
  const phone = usePhoneLayout()

  useEffect(() => {
    if (!phone) return

    const onPointerDown = (event: PointerEvent): void => {
      if (openRow === null) return
      const target = event.target
      if (!(target instanceof Element)) return
      // Inside the open row: the finger is using the buttons, not leaving them.
      if (target.closest('.inline-row[data-revealed="true"]') !== null) return
      setOpenRow(null)
    }

    // Capture, so a control that stops the event on its way up cannot keep a
    // row open by accident.
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [phone])
}

/**
 * The touch handlers that open a row.
 *
 * Two ways in, because a long press and a swipe are different gestures and
 * people reach for different ones: a long press opens every row, so the user
 * can work through the page; a swipe opens the one row under the finger.
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

      cancel()
      timer.current = window.setTimeout(() => {
        setEveryRow(true)
        timer.current = null
      }, LONG_PRESS_MS)
    },
    [phone, cancel],
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
        setOpenRow(key)
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
