/**
 * The edit view, driven by the registry.
 *
 * Loads the record (or starts blank), renders the generic form, and returns to
 * the list on save. One form in the DOM at a time (D10).
 */

import { useEffect, useState } from 'react'
import { RecordForm } from './RecordForm'
import { saveFields, useFieldContext } from './data'
import { blankRecord, REGISTRY, type RegistryKey } from './registry'
import { valuesFromRecord } from './fields'
import { db } from '../../storage/db'

export interface RegistryEditProps {
  registryKey: RegistryKey
  /** `null` for a new record. */
  id: string | null
  now: Date
}

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; record: Record<string, unknown> } | { kind: 'missing' }

export function RegistryEdit({ registryKey, id, now }: RegistryEditProps) {
  const definition = REGISTRY[registryKey]
  const context = useFieldContext(now)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (id === null) {
        if (!cancelled) setState({ kind: 'ready', record: blankRecord(registryKey, now) })
        return
      }
      const record: unknown = await db.table(definition.table).get(id)
      if (cancelled) return
      if (record === undefined) {
        setState({ kind: 'missing' })
        return
      }
      setState({ kind: 'ready', record: record as Record<string, unknown> })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [registryKey, id, now, definition.table])

  if (state.kind === 'loading') return <p className="hint">Loading…</p>

  if (state.kind === 'missing') {
    return (
      <section>
        <h2>{definition.singular} not found</h2>
        <p className="hint">
          It may have been deleted.{' '}
          <a href={`#${definition.listPath}`}>Back to {definition.plural.toLowerCase()}</a>.
        </p>
      </section>
    )
  }

  const fields = definition.fields(context)

  return (
    <RecordForm
      title={
        id === null
          ? `Add ${definition.singular.toLowerCase()}`
          : `Edit ${definition.singular.toLowerCase()}`
      }
      fields={fields}
      values={valuesFromRecord(state.record, fields)}
      submitLabel="Save"
      error={error}
      onCancel={() => {
        window.location.hash = definition.listPath
      }}
      onSubmit={(values) => {
        void (async () => {
          try {
            await saveFields(registryKey, id, values, now)
            window.location.hash = definition.listPath
          } catch (caught) {
            /**
             * Shown rather than thrown. A record that fails its own schema is a
             * data problem the user can act on; an unhandled rejection would be a
             * blank page and a console message they will never see.
             */
            setError(caught instanceof Error ? caught.message : 'Could not save this record.')
          }
        })()
      }}
    />
  )
}
