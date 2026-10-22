/**
 * The rows of the editing pages, and the sections they sit in.
 *
 * A row shows a record and the things you can do with it. Opening a record used
 * to expand its form underneath the row, in place, which meant the page grew as
 * you worked and the rows below moved out from under the pointer. Editing is now
 * a page of its own: the row's links go to the record's route, and the form is
 * the same one that route has always rendered.
 *
 * The rows themselves are unchanged in what they show — enough of a record to
 * recognise it without opening it, which is the point of having the editor be a
 * list of rows rather than a list of forms.
 */

import { REGISTRY, type RegistryKey } from '../shared/registry'
import { EditIcon, HideIcon, PlusIcon, UndoIcon } from '../../app/Icons'
import { text } from './recordText'
import { useRevealOnTouch } from './rowReveal'

/** A row that shows one record and what can be done with it. */
export function InlineRow({
  registryKey,
  record,
  heading,
  detail,
  preview,
  actions,
  handle,
  drop,
  onDragOver,
  onDrop,
  onDelete,
  onRecover,
}: {
  registryKey: RegistryKey
  record: Record<string, unknown>
  heading: string
  detail: string
  /**
   * Body text shown under the heading so the record can be read without opening
   * it. Clamped in CSS rather than truncated here, so the full text is in the
   * document and only the display is shortened (D31: no text is cut to achieve a
   * layout).
   *
   * Nodes rather than a string because a job shows two blocks — its
   * responsibilities and, when stories are included, its story on its own line —
   * and a story is styled differently from the rest. A string could not carry
   * that without a delimiter the CSS would have to know about.
   */
  preview?: React.ReactNode
  /** Buttons shown beside Edit — "add achievement", and the like. */
  actions?: React.ReactNode
  /**
   * A grip the user drags the row by, for a list whose order they can change.
   *
   * The row's own control is the disclosure that opens its editor, so the grip is
   * a separate control rather than a change to that one: dragging a row and
   * opening it are different actions, and a button that did both would be a
   * button that did neither well.
   */
  handle?: React.ReactNode
  /** Where a dragged row would land if it were dropped on this one. */
  drop?: 'before' | 'after' | ''
  /** Called as a dragged row passes over this one. */
  onDragOver?: (event: React.DragEvent) => void
  /** Called when a dragged row is dropped on this one. */
  onDrop?: (event: React.DragEvent) => void
  /**
   * Deletes this record.
   *
   * Passed in rather than looked up, because the row does not know what the
   * surrounding page does about undo. The list views and the editor both offer
   * delete and both offer undo afterwards, and they are different components.
   */
  onDelete?: (id: string) => void
  /**
   * Brings this record back, for one that has been hidden.
   *
   * A hidden record offers to be recovered rather than hidden again: hiding
   * it a second time is not a thing a record can be asked to do, and the control
   * that undoes the mistake is the one the user is looking for.
   */
  onRecover?: (id: string) => void
}) {
  const isDeleted = text(record, 'deletedAt') !== ''
  const editHref = `#${REGISTRY[registryKey].editPath(text(record, 'id'))}`

  /*
   * The row's controls, and the touch that opens them.
   *
   * On a phone the controls are hidden until the row is opened — with a long
   * press or a swipe — because there is room for the record and not for the
   * record's controls. The key is the record's own, with its table, so two
   * records in two tables never share an open row.
   */
  const reveal = useRevealOnTouch(`${registryKey}:${text(record, 'id')}`)

  return (
    <div
      className={['inline-row', `inline-row-${registryKey}`, isDeleted ? 'is-deleted' : '']
        .filter((name) => name !== '')
        .join(' ')}
      // The record's id on the row itself, so a test — or a user in devtools —
      // can confirm a record was saved under a real id rather than an empty one.
      data-record-id={text(record, 'id')}
      {...(reveal.revealed ? { 'data-revealed': 'true' } : {})}
      onTouchStart={reveal.onTouchStart}
      onTouchMove={reveal.onTouchMove}
      onTouchEnd={reveal.onTouchEnd}
      onTouchCancel={reveal.onTouchEnd}
      onContextMenu={reveal.onContextMenu}
      {...(handle === undefined ? {} : { onDragOver, onDrop, 'data-drop': drop })}
    >
      <div className="inline-row-head">
        {handle}
        {/*
          The heading is the link, not a disclosure.

          It used to be a button that expanded the form underneath, with a
          chevron to say so. There is nothing to expand now, and a chevron next
          to something that navigates is a promise the control does not keep.
        */}
        <a className="inline-row-toggle" href={editHref}>
          <span className="inline-row-heading">
            {isDeleted && <span className="badge">hidden</span>}
            {/*
              On the row, not only in the form.

              Hiding a role's detail from the document is invisible everywhere except
              the printed page, so a user looking at the editor has no way of telling
              a role they summarised from one they never filled in. The checkbox
              records it when they set it and nothing reminds them afterwards; this is
              what says, at a glance, which roles are one liners.
            */}
            {text(record, 'hideDetail') === 'true' && (
              <span className="badge badge-note">summary only</span>
            )}
            {heading}
          </span>
          {detail !== '' && <span className="inline-row-detail">{detail}</span>}
        </a>

        <div className="inline-row-actions">
          {actions}
          {/*
            A link rather than a button, because it goes somewhere. A button that
            navigates cannot be opened in a new tab, and a link that does
            something else cannot be.
          */}
          <a
            className="button button-small button-icon"
            href={editHref}
            title="Edit"
            aria-label="Edit"
          >
            <EditIcon size={14} />
          </a>
          {/*
            A hidden record is offered back rather than hidden again.

            The button that hid it is replaced rather than joined by a second
            one: a row with "Hide" and "Recover" side by side reads as a record
            that is both hidden and not, and the only one of the two that can be
            pressed is the one that is right.
          */}
          {isDeleted
            ? onRecover !== undefined && (
                <button
                  type="button"
                  className="button button-small button-icon"
                  title="Recover"
                  aria-label="Recover"
                  onClick={() => {
                    onRecover(text(record, 'id'))
                  }}
                >
                  <UndoIcon size={14} />
                </button>
              )
            : onDelete !== undefined && (
                <button
                  type="button"
                  className="button button-small button-icon"
                  title="Hide"
                  aria-label="Hide"
                  onClick={() => {
                    onDelete(text(record, 'id'))
                  }}
                >
                  <HideIcon size={14} />
                </button>
              )}
        </div>
      </div>

      {preview !== undefined && preview !== null && preview !== '' && (
        // A `div`, not a `p`: the preview holds one block per paragraph, and
        // nesting `p` in `p` is not valid HTML.
        <div className="inline-row-preview">{preview}</div>
      )}
    </div>
  )
}

/** A section with a heading, an "add" link, and its rows. */
export function InlineSection({
  title,
  registryKey,
  records,
  describe,
  emptyText,
  onRecover,
  renderChildren,
  actionsFor,
  preview,
  onDelete,
  newHref,
}: {
  title: string
  registryKey: RegistryKey
  records: Record<string, unknown>[]
  describe: (record: Record<string, unknown>) => { heading: string; detail: string }
  emptyText: string
  /** Nested editors, rendered inside the matching row. */
  renderChildren?: (record: Record<string, unknown>) => React.ReactNode
  /** Buttons shown beside the row's Edit button. */
  actionsFor?: (record: Record<string, unknown>) => React.ReactNode
  /** Body text shown under the heading, so the record reads without opening. */
  preview?: (record: Record<string, unknown>) => React.ReactNode
  /** Deletes one record; see `InlineRow`. */
  onDelete?: (id: string) => void
  /** Brings a hidden record back; see `InlineRow`. */
  onRecover?: (id: string) => void
  /**
   * Where the "add" link goes.
   *
   * A link, because it navigates to the form for a new record. The form used to
   * open here, under the heading, which grew the page as it opened.
   */
  newHref?: string | undefined
}) {
  const definition = REGISTRY[registryKey]

  return (
    <section className="inline-section">
      <header className="inline-section-head">
        <h2>{title}</h2>
        <div className="inline-section-actions">
          {newHref !== undefined && (
            <a
              className="button button-primary button-icon"
              title={`Add ${definition.singular.toLowerCase()}`}
              aria-label={`Add ${definition.singular.toLowerCase()}`}
              href={`#${newHref}`}
            >
              <PlusIcon size={14} />
            </a>
          )}
        </div>
      </header>

      {records.length === 0 ? (
        <p className="hint">{emptyText}</p>
      ) : (
        <div className="inline-rows">
          {records.map((record) => {
            const described = describe(record)
            const recordActions = actionsFor?.(record)
            const previewNode = preview ? preview(record) : null
            return (
              <div key={text(record, 'id')} className="inline-row-group">
                <InlineRow
                  registryKey={registryKey}
                  record={record}
                  heading={described.heading}
                  detail={described.detail}
                  {...(previewNode !== null && previewNode !== undefined && previewNode !== ''
                    ? { preview: previewNode }
                    : {})}
                  {...(recordActions !== undefined ? { actions: recordActions } : {})}
                  {...(onDelete !== undefined ? { onDelete } : {})}
                  {...(onRecover !== undefined ? { onRecover } : {})}
                />
                {renderChildren?.(record)}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
