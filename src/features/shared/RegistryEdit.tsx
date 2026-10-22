/**
 * The edit view, driven by the registry.
 *
 * Loads the record (or starts blank), renders the generic form, and returns to
 * the list on save. One form in the DOM at a time (D10).
 */

import { useCallback, useEffect, useState } from 'react'
import { RecordForm } from './RecordForm'
import { saveFields, useFieldContext, useRecords } from './data'
import { ASSISTANT_ENABLED } from '../../ai/enabled'
import { PHRASES_ENABLED } from './phrases'
import { blankRecord, REGISTRY, type RegistryKey } from './registry'
import { valuesFromRecord } from './fields'
import { text } from '../document/recordText'
import { db } from '../../storage/db'
import { restoreFocusTo } from '../../app/router'
import type { Mergeable } from '../../domain/types'

export interface RegistryEditProps {
  registryKey: RegistryKey
  /** `null` for a new record. */
  id: string | null
  now: Date
  /**
   * Fields to start a new record with.
   *
   * The parent, when the link that opened the form named one: "add an
   * achievement under this job" arrives with the job in it, so the form does not
   * ask which job again. A field the form does not own is ignored, so this
   * cannot set anything the record does not have.
   */
  seed?: Record<string, unknown>
  /**
   * Where to go when the form is finished or cancelled.
   *
   * The page the form was opened from, so cancelling a job sends the user back
   * to the career page and cancelling a question sends them back to the
   * questions page. Without it the form falls back to the record's own list,
   * which is right for a form opened from that list and wrong for one opened
   * from anywhere else.
   */
  from?: string | null
}

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; record: Record<string, unknown> } | { kind: 'missing' }

export function RegistryEdit({ registryKey, id, now, seed, from }: RegistryEditProps) {
  const definition = REGISTRY[registryKey]
  const context = useFieldContext(now)
  // The writing-support material, for the entities that are written from it
  // (Phase 9). Read here rather than passed down, so every form that can use a
  // phrase has the phrases without each caller remembering to fetch them.
  const { records: phrases } = useRecords<Mergeable & Record<string, unknown>>('phrases')

  /*
   * The parent, if the link named one that exists.
   *
   * "Add an achievement under this job" arrives with the job in the query, so
   * the form starts with it filled in. The value comes from the URL, so it is
   * checked against the database before it is used: a link naming a job that is
   * not there would otherwise create an achievement that belongs to nothing,
   * which the document cannot show and the user cannot find.
   */
  const parentExists = useCallback(async (column: string, id: string): Promise<boolean> => {
    const table = column === 'jobId' ? db.jobs : db.questionCategories
    return (await table.get(id)) !== undefined
  }, [])
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (id === null) {
        const parent = definition.parent
        const named = seed === undefined || parent === undefined ? '' : seed[parent.column]
        let seeded: Record<string, unknown> = {}
        if (typeof named === 'string' && named !== '') {
          const exists = await parentExists(parent?.column ?? '', named)
          if (exists) seeded = { [parent?.column ?? '']: named }
        }
        if (!cancelled) {
          setState({ kind: 'ready', record: { ...blankRecord(registryKey, now), ...seeded } })
        }
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
  }, [registryKey, id, now, definition.table, definition.parent, seed, parentExists])

  if (state.kind === 'loading') return <p className="hint">Loading…</p>

  if (state.kind === 'missing') {
    return (
      <section>
        <h2>{definition.singular} not found</h2>
        <p className="hint">
          It may have been hidden.{' '}
          <a href={`#${definition.listPath}`}>Back to {definition.plural.toLowerCase()}</a>.
        </p>
      </section>
    )
  }

  const fields = definition.fields(context)

  /**
   * Where the form sends the user when it is finished or cancelled.
   *
   * Back through the history, to the page the link was on. The browser puts the
   * focus back on the link that opened the form when it goes back that way,
   * which is what a user who opened a form by keyboard expects to find when they
   * close it — and the page they return to is the one they were reading, not
   * whichever list happens to hold that kind of record.
   *
   * A form reached by typing its route has no history to go back through, and
   * falls back to the record's own list.
   */
  const leave = () => {
    if (from !== null) {
      // The form's own route, so the control that opened it can be found again
      // on the page being returned to.
      const route = window.location.hash
      window.history.back()
      restoreFocusTo(route)
      return
    }
    window.location.hash = definition.listPath
  }

  return (
    <RecordForm
      title={
        id === null
          ? `Add ${definition.singular.toLowerCase()}`
          : `Edit ${definition.singular.toLowerCase()}`
      }
      fields={fields}
      values={valuesFromRecord(state.record, fields)}
      {...(definition.assistField === undefined || !PHRASES_ENABLED
        ? {}
        : {
            assist: {
              field: definition.assistField,
              phrases: phrases.map((phrase) => ({
                id: text(phrase, 'id'),
                text: text(phrase, 'text'),
              })),
              // The drafting panel is not in this release; see `src/ai/enabled.ts`.
              drafting: ASSISTANT_ENABLED,
            },
          })}
      submitLabel="Save"
      error={error}
      onCancel={leave}
      onSubmit={(values) => {
        void (async () => {
          try {
            await saveFields(registryKey, id, values, now)
            leave()
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
