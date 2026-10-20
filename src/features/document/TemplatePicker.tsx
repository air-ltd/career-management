/**
 * The template picker, in the document's rail.
 *
 * D60: the template sits with the preset and the profile, because the three of
 * them are the three choices that decide a document. And it says what each
 * template is before it is chosen, because "International" tells the user nothing
 * about what they will get.
 */

import { useState } from 'react'
import { templateSummary } from '../../domain/templates'
import { useTemplates } from './useTemplates'
import type { Settings } from '../../domain/types'

export function TemplatePicker({
  settings,
  saveSettings,
  now,
}: {
  settings: Settings
  saveSettings: (next: Settings) => void
  now: Date
}) {
  const api = useTemplates(settings, saveSettings, now)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const current = api.current
  const deletable = current !== null && !current.builtIn

  return (
    <div className="document-field document-template">
      <label htmlFor="document-template">Template</label>
      <select
        id="document-template"
        value={current?.id ?? ''}
        onChange={(event) => {
          const chosen = api.templates.find((template) => template.id === event.target.value)
          if (chosen !== undefined) api.apply(chosen)
        }}
      >
        {/*
          A document that matches no template is a document the user has shaped
          themselves, and saying so is better than showing a template that does
          not describe it.
        */}
        {current === null && <option value="">Custom</option>}
        {api.templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>

      {current !== null && (
        <p className="document-template-summary">{templateSummary(current)}</p>
      )}

      <div className="document-template-actions">
        {naming ? (
          <>
            <label className="sr-only" htmlFor="document-template-name">
              Name for the new template
            </label>
            <input
              id="document-template-name"
              type="text"
              value={name}
              placeholder="Template name"
              onChange={(event) => {
                setName(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  api.saveCurrentAs(name)
                  setNaming(false)
                  setName('')
                }
                if (event.key === 'Escape') {
                  setNaming(false)
                  setName('')
                }
              }}
            />
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                api.saveCurrentAs(name)
                setNaming(false)
                setName('')
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                setNaming(false)
                setName('')
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              setNaming(true)
            }}
          >
            Save current as a template
          </button>
        )}
        {deletable && (
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              if (current !== null) api.remove(current)
            }}
          >
            Delete
          </button>
        )}
      </div>

      {/*
        The undo, in the same shape as a record's: what was deleted, and a way
        back. A template is settings, and settings have no other copy — a document
        already sent to an employer cannot be regenerated from the app.
      */}
      {api.undo !== null && (
        <div className="undo-bar" role="status">
          <span>Deleted {api.undo.name}.</span>
          <button type="button" className="button" onClick={api.restore}>
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
