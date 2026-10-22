/**
 * Manual ordering for a list of records.
 *
 * The hook and the two components that go with it are separate files because a
 * file that exports both a hook and a component breaks fast refresh — the rule
 * exists so that editing a component reloads only the components, and a module
 * that mixes the two cannot be split when the editor tries.
 */
import { useCallback, useRef, useState } from 'react'

export interface RowOrderApi {
  /**
   * The props for the element that wraps a row.
   *
   * The row rather than the handle, because the row is what the pointer passes
   * over, and where it lands is decided by which half of the row it is in.
   */
  rowProps: (
    id: string,
    index: number,
  ) => {
    onDragOver: (event: React.DragEvent) => void
    onDrop: (event: React.DragEvent) => void
    'data-drop': 'before' | 'after' | ''
  }
  /** The props for the handle on a row. */
  handleProps: (
    id: string,
    index: number,
  ) => {
    draggable: boolean
    onDragStart: (event: React.DragEvent) => void
    onDragEnd: () => void
    onClick: () => void
    onKeyDown: (event: React.KeyboardEvent) => void
    'aria-label': string
    'aria-pressed': boolean
    'data-grabbed': boolean
  }
  /** What the live region says, and the region itself. */
  message: string
}

/**
 * The dragging state for one list.
 *
 * `ids` is the list in the order it is currently shown. `onReorder` is given the
 * new order and is expected to persist it.
 */
export function useRowOrder({
  ids,
  onReorder,
  describe,
}: {
  ids: string[]
  onReorder: (ids: string[]) => void
  /** The name of a record, for the announcements. */
  describe: (id: string) => string
}): RowOrderApi {
  /** The record being dragged, if any. */
  const [dragging, setDragging] = useState<string | null>(null)
  /** Where the dragged record would land, as an index into the current list. */
  const [dropAt, setDropAt] = useState<number | null>(null)
  /** The record held by the keyboard, if any. */
  const [grabbed, setGrabbed] = useState<string | null>(null)
  /** The order when the keyboard picked the record up, so Escape can undo it. */
  const grabbedFrom = useRef<string[] | null>(null)
  const [message, setMessage] = useState('')

  /**
   * Move a record to an index, and report it.
   *
   * The index is into the list with the record taken out, so "put it back where
   * it was" is the same operation as any other move.
   */
  const move = useCallback(
    (id: string, to: number, announcement: string) => {
      const from = ids.indexOf(id)
      if (from === -1) return
      const without = ids.filter((candidate) => candidate !== id)
      const target = Math.max(0, Math.min(without.length, to))
      if (target === from) return
      onReorder([...without.slice(0, target), id, ...without.slice(target)])
      setMessage(announcement)
    },
    [ids, onReorder],
  )

  const rowProps = useCallback(
    (_id: string, index: number) => ({
      onDragOver: (event: React.DragEvent) => {
        if (dragging === null) return
        // Without this the browser refuses the drop and nothing happens.
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const rect = event.currentTarget.getBoundingClientRect()
        // The half of the row the pointer is in decides whether the record lands
        // above it or below it, which is what makes a drop land where the user
        // aimed rather than always in one place.
        const after = event.clientY > rect.top + rect.height / 2
        setDropAt(after ? index + 1 : index)
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault()
        const from = ids.indexOf(dragging ?? '')
        if (dragging !== null && dropAt !== null) {
          const without = ids.filter((candidate) => candidate !== dragging)
          // The drop index counts the dragged record as still in the list, so it
          // is one too high when the record is dropped below itself.
          const target = dropAt > from ? dropAt - 1 : dropAt
          onReorder([...without.slice(0, target), dragging, ...without.slice(target)])
          setMessage(
            `${describe(dragging)} moved to position ${target + 1} of ${without.length + 1}.`,
          )
        }
        setDragging(null)
        setDropAt(null)
      },
      'data-drop': dropMarker(dropAt, index, ids.length),
    }),
    [dragging, dropAt, ids, onReorder, describe],
  )

  const handleProps = useCallback(
    (id: string, index: number) => ({
      draggable: true,
      onDragStart: (event: React.DragEvent) => {
        setDragging(id)
        // Firefox will not begin a drag without some data on it.
        event.dataTransfer.setData('text/plain', id)
        event.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: () => {
        setDragging(null)
        setDropAt(null)
      },
      onClick: () => {
        // The button picks the record up and puts it down. Enter and Space reach
        // the click, so the keyboard route and the mouse route are the same
        // button.
        if (grabbed === id) {
          setGrabbed(null)
          grabbedFrom.current = null
          setMessage(`${describe(id)} dropped at position ${index + 1} of ${ids.length}.`)
          return
        }
        setGrabbed(id)
        grabbedFrom.current = ids
        setMessage(`${describe(id)} picked up. Use the arrow keys to move it.`)
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (grabbed !== id) return
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          const step = event.key === 'ArrowUp' ? -1 : 1
          const target = index + step
          if (target < 0 || target > ids.length - 1) return
          move(id, target, `${describe(id)} moved to position ${target + 1} of ${ids.length}.`)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          const original = grabbedFrom.current
          if (original !== null) onReorder(original)
          setGrabbed(null)
          grabbedFrom.current = null
          setMessage(`${describe(id)} put back.`)
        }
      },
      'aria-label': `Reorder ${describe(id)}. Press to pick it up, then use the arrow keys.`,
      'aria-pressed': grabbed === id,
      'data-grabbed': grabbed === id,
    }),
    [grabbed, ids, move, describe, onReorder],
  )

  return { rowProps, handleProps, message }
}

/**
 * Where the drop line goes on a row.
 *
 * The line marks a position in the list, and exactly one row carries it: the one
 * the record would land above, or the last one when the record would land below
 * everything. Marking both rows either side of a gap would draw two lines where
 * there is one gap, and the rows are stacked flush — there is no gap to draw in.
 */
function dropMarker(
  dropAt: number | null,
  index: number,
  total: number,
): 'before' | 'after' | '' {
  if (dropAt === null) return ''
  if (dropAt === index) return 'before'
  if (dropAt === total && index === total - 1) return 'after'
  return ''
}
