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

import { useState } from 'react'
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
  const isNew = record === null
  const recordId = record === null ? null : text(record, 'id')

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

  return (
    <div className="inline-editor">
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
              await saveFields(registryKey, recordId, next, now)
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
  fields,
  now,
  actions,
  onSaved,
}: {
  registryKey: RegistryKey
  record: Record<string, unknown>
  heading: string
  detail: string
  fields: readonly Field[]
  now: Date
  actions?: React.ReactNode
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const isDeleted = text(record, 'deletedAt') !== ''

  return (
    <div className={isDeleted ? 'inline-row is-deleted' : 'inline-row'}>
      <div className="inline-row-head">
        <button
          type="button"
          className="inline-row-toggle"
          aria-expanded={open}
          onClick={() => {
            setOpen((previous) => !previous)
          }}
        >
          <ChevronIcon size={16} />
          <span className="inline-row-heading">
            {isDeleted && <span className="badge">deleted</span>}
            {heading}
          </span>
          {detail !== '' && <span className="inline-row-detail">{detail}</span>}
        </button>
        {!open && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setOpen(true)
            }}
          >
            Edit
          </button>
        )}
      </div>

      {open && (
        <InlineEditor
          registryKey={registryKey}
          record={record}
          fields={fields}
          now={now}
          actions={actions}
          onDone={onSaved}
          onCancel={() => {
            setOpen(false)
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
  actionsFor?: (record: Record<string, unknown>) => React.ReactNode
}) {
  const [adding, setAdding] = useState(false)
  const definition = REGISTRY[registryKey]

  return (
    <section className="inline-section">
      <header className="inline-section-head">
        <h2>{title}</h2>
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
                  {...(actionsFor ? { actions: actionsFor(record) } : {})}
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
