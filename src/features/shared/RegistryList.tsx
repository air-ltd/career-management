/**
 * The list view, driven by the registry.
 *
 * One component for all seven entities. The alternative — seven near-identical
 * views — is how a label ends up right in six of them.
 */

import { useMemo, useState } from 'react'
import { RecordList } from './RecordList'
import { deleteRecord, restoreRecord, useFieldContext, useRecords } from './data'
import { REGISTRY, type RegistryKey } from './registry'
import { UndoIcon } from '../../app/Icons'
import type { Mergeable } from '../../domain/types'

export interface RegistryListProps {
  registryKey: RegistryKey
  now: Date
}

export function RegistryList({ registryKey, now }: RegistryListProps) {
  const definition = REGISTRY[registryKey]
  const { records, loading } = useRecords<Mergeable & Record<string, unknown>>(registryKey)
  const context = useFieldContext(now)
  const [showDeleted, setShowDeleted] = useState(false)
  /*
   * Search and order are held here rather than in `RecordList` so they survive the
   * list unmounting: saving and returning to the list is a round trip, and coming
   * back to an empty search box is a small, repeated annoyance.
   */
  const [query, setQuery] = useState('')

  // The undo target is held here rather than in a toast component, because a
  // deleted record is still in the database and can simply be marked live again.
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null)

  /*
   * Sorted before mapping, so the sort sees the record rather than the two lines
   * derived from it — "Recently edited" is a fact about the record, and the row
   * text does not carry it.
   *
   * Above the loading early-return below, because a hook after a conditional
   * return is a hook that runs a different number of times on the first render
   * than on every one after it.
   */
  // Newest first, and no way to change it.
  const ordered = useMemo(
    () => [...records].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [records],
  )

  if (loading) return <p className="hint">Loading…</p>

  const items = ordered.map((record) => {
    const described = definition.describe(record, context)
    return {
      id: record.id,
      heading: described.heading,
      detail: described.detail,
      deleted: record.deletedAt !== null,
    }
  })

  async function handleDelete(id: string) {
    const record = records.find((row) => row.id === id)
    await deleteRecord(registryKey, id, now)
    const described = record ? definition.describe(record, context) : null
    setUndo({ id, label: described?.heading ?? 'Record' })
  }

  return (
    <>
      <RecordList
        title={definition.plural}
        items={items}
        editHref={definition.editPath}
        // Spread rather than passed, because `exactOptionalPropertyTypes` treats
        // an explicit `undefined` as different from an absent key.
        {...(definition.newPath !== undefined ? { newHref: definition.newPath } : {})}
        newLabel={`Add ${definition.singular.toLowerCase()}`}
        showDeleted={showDeleted}
        onToggleShowDeleted={setShowDeleted}
        query={query}
        onQueryChange={setQuery}
        onDelete={(id) => {
          void handleDelete(id)
        }}
        onRecover={(id) => {
          void restoreRecord(registryKey, id, now)
        }}
        emptyText={`No ${definition.plural.toLowerCase()} yet.`}
      />

      {undo !== null && (
        <div className="undo-bar" role="status">
          <span>Hidden {undo.label}.</span>
          <button
            type="button"
            className="button"
            onClick={() => {
              setUndo(null)
              window.location.hash = definition.listPath
            }}
          >
            <UndoIcon />
            Undo
          </button>
        </div>
      )}
    </>
  )
}
