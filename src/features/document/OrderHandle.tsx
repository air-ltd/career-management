/**
 * The controls that make a list reorderable by hand.
 *
 * A grip to drag the row by, and the announcement that says what just happened.
 */

import { GripIcon } from '../../app/Icons'
import type { RowOrderApi } from './useRowOrder'

/** The props one row's grip takes. */
export type RowHandleProps = ReturnType<RowOrderApi['handleProps']>

/** The grip on a row the user drags. */
export function OrderHandle({ handleProps }: { handleProps: RowHandleProps }) {
  return (
    <button type="button" className="inline-order-handle" {...handleProps}>
      <GripIcon size={14} />
    </button>
  )
}

/** The live region that says what just happened. */
export function OrderAnnouncement({ message }: { message: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {message}
    </p>
  )
}
