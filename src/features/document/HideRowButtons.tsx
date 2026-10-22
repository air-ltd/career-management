/**
 * The way out of the every-row mode.
 *
 * A long press shows the controls on every row at once, which is useful for
 * rearranging a page and wrong for reading it. The mode is deliberately not
 * closed by touching elsewhere — a user working through the page would keep
 * losing it — so it needs a control of its own, and one that is on the screen
 * wherever the long press happened.
 *
 * The corner of the screen rather than a bar among the rows: a control in the
 * flow is a control the user has to scroll to find, and the point of this one
 * is that it is always there. It sits above the header's own controls, which
 * at a phone's width are below it, so the two never sit on top of each other.
 *
 * Rendered only on a phone, and only while the mode is on: on a laptop the
 * controls are never hidden, so there is nothing to switch back off.
 */
import { CloseIcon } from '../../app/Icons'
import { usePhoneLayout } from '../../app/device'
import { setEveryRow, useEveryRow } from './rowReveal'

export function HideRowButtons() {
  const phone = usePhoneLayout()
  const everyRow = useEveryRow()

  if (!phone || !everyRow) return null

  return (
    <button
      type="button"
      className="button row-buttons-off"
      aria-label="Hide row buttons"
      onClick={() => setEveryRow(false)}
    >
      <CloseIcon />
    </button>
  )
}
