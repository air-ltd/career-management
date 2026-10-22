/**
 * The edit form, used by every entity.
 *
 * One form in the DOM at a time (D10). The legacy app rendered an edit form per
 * record into the page, so a CV with thirty achievements shipped thirty forms and
 * the browser rendered all of them before the user had scrolled anywhere.
 *
 * This form is a controlled component driven by field descriptors, so an entity
 * adds a field by adding a descriptor rather than by copying a form.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { validate, type Field, type FieldValues } from './fields'
import { DraftPanel } from '../document/DraftPanel'

export interface RecordFormProps {
  title: string
  fields: readonly Field[]
  values: FieldValues
  submitLabel: string
  onSubmit: (values: FieldValues) => void
  /** Extra controls rendered beside the save button — "delete", "cancel". */
  actions?: ReactNode
  onCancel: () => void
  /** A record that failed to save on the server side, not in validation. */
  error?: string | null
  /**
   * The writing-support material, offered while this record is being written.
   *
   * The fit report says an achievement will run to four lines; what the user
   * does next is look at an example of a good one (Phase 9). The phrases are
   * offered here, in the form they are being used in, because that is where they
   * are wanted.
   */
  assist?: {
    /** The field a phrase goes into. */
    field: string
    /** The phrases the user has written. */
    phrases: readonly { id: string; text: string }[]
    /** Whether the assistant drafting panel is offered. */
    drafting?: boolean
  }
}

export function RecordForm({
  title,
  fields,
  values,
  submitLabel,
  onSubmit,
  actions,
  assist,
  onCancel,
  error = null,
}: RecordFormProps) {
  const headingId = useId()
  const [current, setCurrent] = useState<FieldValues>(values)
  const [problems, setProblems] = useState<string[]>([])
  const shell = useRef<HTMLFormElement | null>(null)

  /**
   * Take focus when the form appears.
   *
   * The form is a page of its own now, so a user who reaches it by keyboard
   * would arrive with the focus on the document body — nothing focused, and the
   * form's first field several tabs away. Focusing the first control is what
   * makes it obvious that there is a form here and what is in it.
   *
   * Not a `<fieldset autofocus>`: autofocus on mount fights a screen reader's own
   * announcement of the region, and this is the same interaction by any means.
   */
  useEffect(() => {
    const first = shell.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button',
    )
    first?.focus()
  }, [])

  /**
   * Put a phrase into the field being written.
   *
   * Appended rather than replacing what is there: the user is part-way through a
   * sentence, and a phrase that wiped it out would be a worse answer than one
   * that sat after it.
   */
  function insertPhrase(text: string) {
    if (assist === undefined) return
    setCurrent((previous) => {
      const existing = previous[assist.field]
      const base = typeof existing === 'string' ? existing : ''
      return { ...previous, [assist.field]: base === '' ? text : `${base}\n${text}` }
    })
  }

  function setValue(name: string, value: string | boolean) {
    setCurrent((previous) => ({ ...previous, [name]: value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const found = validate(fields, current)
    setProblems(found)
    // Do not call `onSubmit` on an invalid form: the entity schema would reject
    // it anyway, and failing here keeps the user's input on screen with the
    // reason next to the field rather than as a banner.
    if (found.length > 0) return
    onSubmit(current)
  }

  return (
    <form
      className="record-form"
      ref={shell}
      onSubmit={handleSubmit}
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>{title}</h2>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {problems.length > 0 && (
        <div className="form-error" role="alert">
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {fields.map((field) => (
        <FieldControl
          key={field.name}
          field={field}
          value={current[field.name]}
          onChange={(value) => {
            setValue(field.name, value)
          }}
        />
      ))}

      {assist !== undefined && assist.phrases.length > 0 && (
        <details className="record-assist">
          <summary>Phrases</summary>
          <ul className="record-assist-list">
            {assist.phrases.map((phrase) => (
              <li key={phrase.id}>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    insertPhrase(phrase.text)
                  }}
                >
                  {phrase.text}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {assist !== undefined && assist.drafting === true && (
        <DraftPanel
          current={
            typeof current[assist.field] === 'string' ? (current[assist.field] as string) : ''
          }
          onUse={(text) => {
            insertPhrase(text)
          }}
        />
      )}

      <div className="button-row">
        <button type="submit" className="button button-primary">
          {submitLabel}
        </button>
        {actions}
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: Field
  value: string | boolean | undefined
  onChange: (value: string | boolean) => void
}) {
  const id = useId()
  const hintId = `${id}-hint`

  const describedBy = field.hint ? hintId : undefined

  if (field.kind === 'checkbox') {
    return (
      <div className="field field-checkbox">
        <input
          type="checkbox"
          id={id}
          checked={value === true}
          aria-describedby={describedBy}
          onChange={(event) => {
            onChange(event.target.checked)
          }}
        />
        <label htmlFor={id}>{field.label}</label>
        {field.hint && (
          <p className="field-hint" id={hintId}>
            {field.hint}
          </p>
        )}
      </div>
    )
  }

  const text = typeof value === 'string' ? value : ''

  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>

      {field.kind === 'textarea' && (
        <textarea
          id={id}
          rows={field.rows ?? 6}
          value={text}
          aria-describedby={describedBy}
          aria-required={field.required === true}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}

      {field.kind === 'text' && (
        <input
          type="text"
          id={id}
          value={text}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-required={field.required === true}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}

      {/* U2. A real date picker, against a value stored at full precision (D17). */}
      {field.kind === 'date' && (
        <input
          type="date"
          id={id}
          value={text}
          aria-describedby={describedBy}
          aria-required={field.required === true}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}

      {/* U3. A year, not the legacy free-text field that was documented as
          "Dates are always formated as YYYY (all digits)". */}
      {field.kind === 'year' && (
        <input
          type="number"
          id={id}
          value={text}
          min={1900}
          max={2200}
          step={1}
          inputMode="numeric"
          aria-describedby={describedBy}
          aria-required={field.required === true}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}

      {field.kind === 'select' && (
        <select
          id={id}
          value={text}
          aria-describedby={describedBy}
          aria-required={field.required === true}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        >
          <option value="">Not set</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {field.hint && (
        <p className="field-hint" id={hintId}>
          {field.hint}
        </p>
      )}
    </div>
  )
}
