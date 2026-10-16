/**
 * Data access for the feature views.
 *
 * A thin layer over `storage/repository.ts` that returns the record a view needs
 * or `null` for "no such record", so views never have to distinguish "not loaded
 * yet" from "does not exist" themselves.
 */

import { useCallback, useEffect, useState } from 'react'
import { bumpRevision, db, subscribeToRevision } from '../../storage/db'
import { listActive, listAll, newId, softDelete } from '../../storage/repository'
import { REGISTRY, type FieldContext, type RegistryKey } from './registry'
import type { Job, Mergeable, QuestionCategory, Settings } from '../../domain/types'
import { defaultSettings } from '../../export/envelope'

/**
 * Re-read a table whenever the storage revision changes.
 *
 * Subscribed rather than passed in, so a record saved by one view appears in
 * another without either of them knowing the other exists — and, more usefully,
 * so a record changed by a later sync merge is reflected while a form is open.
 */
export function useRecords<T extends Mergeable>(key: RegistryKey) {
  const [records, setRecords] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const rows = await listAll(db.table(REGISTRY[key].table))
    setRecords(rows)
    setLoading(false)
  }, [key])

  useEffect(() => {
    /**
     * The initial read is asynchronous because IndexedDB is, and there is no
     * synchronous version to hoist out of the effect. The `setState` calls happen
     * after an `await`, not in the effect body, so this is a subscription to an
     * external system rather than a cascading render — which is what the rule is
     * about, and what it cannot see from here.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    return subscribeToRevision(() => {
      void reload()
    })
  }, [reload])

  return { records, loading, reload }
}

/**
 * The options every form needs: the jobs an achievement can belong to, the
 * categories a question can belong to, and "now".
 *
 * `now` is passed in rather than read inside the form, so a test can assert on a
 * default date without freezing the clock globally.
 */
export function useFieldContext(now: Date): FieldContext {
  const { records: jobs } = useRecords<Job>('jobs')
  const { records: categories } = useRecords<QuestionCategory>('questionCategories')
  return { jobs, questionCategories: categories, now }
}

export async function saveFields(
  key: RegistryKey,
  id: string | null,
  values: Record<string, string | boolean>,
  now: Date,
): Promise<string> {
  const definition = REGISTRY[key]
  const table = db.table(definition.table)

  // An empty id means "not a record yet" as firmly as null does. Ids come from
  // `newId` or from the database, so an empty string can only mean a caller asked
  // for a new record — and storing it would produce a row every save collides
  // with.
  const isNew = id === null || id === ''
  const recordId = isNew ? newId() : id
  const stamp = now.toISOString()

  // Loose rows, for the same reason as the registry's `Row`: `db.table()` is typed
  // by argument and this function is generic over which of the seven it was given.
  const existing = (id === null ? undefined : await table.get(id)) as
    Record<string, unknown> | undefined

  // Null out the fields the form does not own, so clearing a date really clears
  // it rather than leaving the previous value behind in the record.
  const owned = new Set(
    definition.fields({ jobs: [], questionCategories: [], now }).map((f) => f.name),
  )

  const next: Record<string, unknown> = {
    ...(existing ?? {}),
    id: recordId,
    updatedAt: stamp,
    deletedAt: existing?.deletedAt ?? null,
  }

  for (const [name, value] of Object.entries(values)) {
    if (!owned.has(name)) continue
    if (typeof value === 'boolean') {
      next[name] = value
    } else if (name === 'year') {
      next[name] = Number(value)
    } else if (name === 'endDate') {
      // A date control that is empty means "not set", and a current role is
      // stored as null (D17) rather than the empty string the legacy app used —
      // which is what took that page down when a null reached `strptime` (L3).
      next[name] = value === '' ? null : value
    } else {
      next[name] = value
    }
  }

  await table.put(next)
  bumpRevision()
  return recordId
}

export async function deleteRecord(key: RegistryKey, id: string, now: Date): Promise<void> {
  await softDelete(db.table(REGISTRY[key].table), id, now)
}

/**
 * The settings singleton.
 *
 * Created on first read rather than seeded at startup, so a user who has never
 * opened the app does not get a settings row written into a document that has
 * not otherwise been touched.
 */
export async function readSettings(): Promise<Settings> {
  const existing = await db.settings.get('settings')
  if (existing) return existing
  const created = defaultSettings(new Date())
  await db.settings.put(created)
  return created
}

export async function writeSettings(settings: Settings, now: Date): Promise<void> {
  await db.settings.put({ ...settings, updatedAt: now.toISOString() })
  bumpRevision()
}

/** Live jobs, for the profile picker and the document. */
export async function activeJobs(): Promise<Job[]> {
  return listActive(db.jobs)
}
