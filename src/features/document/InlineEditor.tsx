/**
 * One record, edited in place.
 *
 * The form is mounted only while the disclosure is open. That is the difference
 * between this and the legacy app, which rendered an edit form for every record
 * into the page — so a CV with thirty achievements shipped thirty forms and the
 * browser rendered all of them before the user had scrolled anywhere. Here the
 * cost is one button per row, which is what you would have drawn anyway.
 *
 * The alternative is kept too: the same `RecordForm` is what the separate
 * `/jobs/:id/edit` route renders, so the two cannot drift apart.
 */

import { useEffect, useRef, useState } from 'react'
import { RecordForm } from '../shared/RecordForm'
import { saveFields } from '../shared/data'
import { REGISTRY, type RegistryKey } from '../shared/registry'
import { emptyValues, valuesFromRecord, type Field, type FieldValues } from '../shared/fields'
import { ChevronIcon } from '../../app/Icons'
import { text } from './recordText'

export interface InlineEditorProps {
  registryKey: RegistryKey
  /** `null` renders a blank form, for "add". */
  record: Record<string, unknown> | null
  fields: readonly Field[]
  now: Date
  /** Rendered next to the save button. */
  actions?: React.ReactNode
  /**
   * Called after a successful save.
   *
   * Deliberately not used to close the form: revising a CV means several changes
   * in a row, and closing after each save turns that into a sequence of
   * re-opens. A caller that wants it closed passes an `onDone` that does.
   */
  onDone: () => void
  onCancel: () => void
}

export function InlineEditor({
  registryKey,
  record,
  fields,
  now,
  actions,
  onDone,
  onCancel,
}: InlineEditorProps) {
  const definition = REGISTRY[registryKey]

  /**
   * "New" is decided by whether the record has an id, not by whether the record
   * object is absent.
   *
   * A nested add form passes a *partly filled* record — `jobId` and an empty
   * achievement, say — so the parent is not lost. That object has no id, and
   * treating it as an existing record titled the form "Edit" and saved it under
   * an empty id.
   */
  const recordId = record === null ? '' : text(record, 'id')
  const isNew = recordId === ''

  /**
   * Values are initialised once, and the component is expected to be remounted
   * when the record changes rather than resynchronised.
   *
   * Every caller already does that: rows are keyed by record id, and the
   * "add" forms mount and unmount as the disclosure opens and closes. An effect
   * to re-read the record would be worse, not merely redundant: if a sync merge
   * updated this record while the form was open, it would discard whatever the
   * user was part-way through typing. Leaving the edit alone and letting it win
   * on `updatedAt` is the right outcome — the user did not ask to be interrupted.
   */
  const [values] = useState<FieldValues>(() =>
    record === null ? emptyValues(fields) : valuesFromRecord(record, fields),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  /*
   * Take focus when the form appears.
   *
   * The form is a disclosure, and a disclosure that opens without moving focus
   * leaves the keyboard user where they were — on the button that is now labelled
   * "Close", with the fields somewhere after it in the tab order and no indication
   * that anything opened at all. Focusing the first control is the one thing that
   * makes it obvious.
   *
   * Not a `<fieldset autofocus>`: autofocus on mount fights a screen reader's own
   * announcement of the region, and this is the same interaction by any means.
   */
  const shell = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const first = shell.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button',
    )
    first?.focus()
  }, [])

  return (
    <div className="inline-editor" ref={shell}>
      <RecordForm
        title={
          isNew
            ? `Add ${definition.singular.toLowerCase()}`
            : `Edit ${definition.singular.toLowerCase()}`
        }
        fields={fields}
        values={values}
        submitLabel="Save"
        error={error}
        actions={actions}
        onCancel={onCancel}
        onSubmit={(next) => {
          void (async () => {
            try {
              await saveFields(registryKey, isNew ? null : recordId, next, now)
              setSaved(true)
              onDone()
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Could not save this record.')
            }
          })()
        }}
      />
      {saved && <p className="hint saved-note">Saved.</p>}
    </div>
  )
}

/** A row that reveals its editor in place. */
export function InlineRow({
  registryKey,
  record,
  heading,
  detail,
  preview,
  fields,
  now,
  actions,
  onDelete,
  onSaved,
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
  fields: readonly Field[]
  now: Date
  /** Buttons shown beside Edit — "add achievement", and the like. */
  actions?: React.ReactNode
  /**
   * Deletes this record.
   *
   * Passed in rather than looked up, because the row does not know what the
   * surrounding page does about undo. The list views and the editor both offer
   * delete and both offer undo afterwards, and they are different components.
   */
  onDelete?: (id: string) => void
  onSaved: () => void
}) {
  const toggle = useRef<HTMLButtonElement | null>(null)

  const [open, setOpen] = useState(false)
  const isDeleted = text(record, 'deletedAt') !== ''

  return (
    <div
      className={isDeleted ? 'inline-row is-deleted' : 'inline-row'}
      // The record's id on the row itself. The row has no edit link to read it
      // from — Edit expands in place — so this is what lets a test, or a user in
      // devtools, confirm a record was saved under a real id rather than an empty
      // one, which is the bug a nested add form can introduce.
      data-record-id={text(record, 'id')}
    >
      <div className="inline-row-head">
        <button
          type="button"
          className="inline-row-toggle"
          aria-expanded={open}
          onClick={() => {
            setOpen((previous) => !previous)
          }}
        >
          <ChevronIcon size={14} />
          <span className="inline-row-heading">
            {isDeleted && <span className="badge">deleted</span>}
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
        </button>

        <div className="inline-row-actions">
          {actions}
          <button
            type="button"
            className="button button-small"
            aria-expanded={open}
            ref={toggle}
            onClick={() => {
              setOpen((previous) => !previous)
            }}
          >
            {open ? 'Close' : 'Edit'}
          </button>
          {onDelete !== undefined && (
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                onDelete(text(record, 'id'))
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {preview !== undefined && preview !== null && preview !== '' && !open && (
        // A `div`, not a `p`: the preview holds one block per paragraph, and
        // nesting `p` in `p` is not valid HTML.
        <div className="inline-row-preview">{preview}</div>
      )}

      {open && (
        <InlineEditor
          registryKey={registryKey}
          record={record}
          fields={fields}
          now={now}
          onDone={onSaved}
          onCancel={() => {
            setOpen(false)
            // Back where the user was, so cancelling does not strand them at the
            // top of the document with no memory of which row they were in.
            toggle.current?.focus()
          }}
        />
      )}
    </div>
  )
}

/** A section with a heading, an "add" disclosure, and its rows. */
export function InlineSection({
  title,
  registryKey,
  records,
  describe,
  fields,
  now,
  emptyText,
  renderChildren,
  actionsFor,
  preview,
  onDelete,
}: {
  title: string
  registryKey: RegistryKey
  records: Record<string, unknown>[]
  describe: (record: Record<string, unknown>) => { heading: string; detail: string }
  fields: readonly Field[]
  now: Date
  emptyText: string
  /** Nested editors, rendered inside the matching row. */
  renderChildren?: (record: Record<string, unknown>) => React.ReactNode
  /** Buttons shown beside the row's Edit button. */
  actionsFor?: (record: Record<string, unknown>) => React.ReactNode
  /** Body text shown under the heading, so the record reads without opening. */
  preview?: (record: Record<string, unknown>) => React.ReactNode
  /** Deletes one record; see `InlineRow`. */
  onDelete?: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const definition = REGISTRY[registryKey]

  return (
    <section className="inline-section">
      <header className="inline-section-head">
        <h2>{title}</h2>
        <div className="inline-section-actions">
          <button
            type="button"
            className="button button-primary"
            aria-expanded={adding}
            onClick={() => {
              setAdding((previous) => !previous)
            }}
          >
            Add {definition.singular.toLowerCase()}
          </button>
        </div>
      </header>

      {adding && (
        <InlineEditor
          registryKey={registryKey}
          record={null}
          fields={fields}
          now={now}
          onDone={() => {
            setAdding(false)
          }}
          onCancel={() => {
            setAdding(false)
          }}
        />
      )}

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
                  fields={fields}
                  now={now}
                  onSaved={() => undefined}
                  {...(previewNode !== null && previewNode !== undefined && previewNode !== ''
                    ? { preview: previewNode }
                    : {})}
                  {...(recordActions !== undefined ? { actions: recordActions } : {})}
                  {...(onDelete !== undefined ? { onDelete } : {})}
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
