/**
 * The list view, driven by the registry.
 *
 * One component for all seven entities. The alternative — seven near-identical
 * views — is how a label ends up right in six of them.
 */

import { useState } from 'react'
import { RecordList } from './RecordList'
import { deleteRecord, useFieldContext, useRecords } from './data'
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

  // The undo target is held here rather than in a toast component, because a
  // deleted record is still in the database and can simply be marked live again.
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null)

  if (loading) return <p className="hint">Loading…</p>

  const items = records.map((record) => {
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
        newHref={definition.newPath}
        newLabel={`Add ${definition.singular.toLowerCase()}`}
        showDeleted={showDeleted}
        onToggleShowDeleted={setShowDeleted}
        onDelete={(id) => {
          void handleDelete(id)
        }}
        emptyText={`No ${definition.plural.toLowerCase()} yet.`}
      />

      {undo !== null && (
        <div className="undo-bar" role="status">
          <span>Deleted {undo.label}.</span>
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
