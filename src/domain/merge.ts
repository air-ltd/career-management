/**
 * Cross-device merge.
 *
 * This is the highest-risk code in the project. It runs unattended, a wrong
 * answer loses a user's document, and a non-deterministic answer means two
 * devices never converge while reporting no error at all.
 *
 * It is therefore a pure function: no I/O, no clock reads, no framework imports,
 * so it can be property-tested directly and reasoned about in isolation.
 */

import { ENTITY_TABLES, type EntityTableName, type Mergeable, type Snapshot } from './types'

/**
 * JSON with object keys sorted, recursively.
 *
 * Used for two things, both of which break if key order is left alone:
 *
 * - The tiebreak in `pickWinner`, where two records claim the same `updatedAt`.
 *   Plain `JSON.stringify` follows insertion order, which differs between two
 *   devices that built the same record by different routes — so each would pick a
 *   different winner from identical data and never agree.
 * - The publish decision in the sync engine, which must compare *content*, not
 *   revisions, because a local-only change leaves the remote revision untouched.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(',')}}`
}

export type MergeOutcome =
  | { ok: true; merged: Snapshot }
  | {
      ok: false
      reason: 'unsupported-schema'
      remoteSchemaVersion: number
      supportedSchemaVersion: number
    }

/**
 * Choose between two versions of the same record.
 *
 * Whole-record last-write-wins, never field-by-field. A field-level merge can
 * synthesise a record that existed on neither device — an achievement whose text
 * came from one side and whose story came from the other, which is a fabrication
 * neither device ever wrote.
 */
function pickWinner<T extends Mergeable>(local: T, remote: T): T {
  if (local.updatedAt > remote.updatedAt) return local
  if (remote.updatedAt > local.updatedAt) return remote

  // Exact tie. Comparing canonical serialisations means every device reaches the
  // same answer independently, without needing to agree on a clock.
  return canonicalStringify(local) >= canonicalStringify(remote) ? local : remote
}

function mergeTable<T extends Mergeable>(local: readonly T[], remote: readonly T[]): T[] {
  const merged = new Map<string, T>()

  for (const record of local) merged.set(record.id, record)
  for (const record of remote) {
    const existing = merged.get(record.id)
    // Nothing on either side is ever dropped: a union, not a replacement.
    merged.set(record.id, existing ? pickWinner(existing, record) : record)
  }

  // Sorted by id so the serialised bytes are identical on every device, which is
  // what lets two devices compare their output and agree there is nothing to do.
  return [...merged.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Merge two snapshots into one.
 *
 * `deletedAt` is an ordinary field, so a deletion is resolved by the same
 * last-write-wins rule as an edit and needs no special case. Tombstones are
 * retained in the output (D51) so a device that was offline for a month does not
 * resurrect a deletion made elsewhere.
 */
export function mergeSnapshots(
  local: Snapshot,
  remote: Snapshot,
  supportedSchemaVersion: number,
): MergeOutcome {
  // Syncing an older client against a newer layout is how data gets corrupted.
  // Refuse rather than interpreting what we do not understand.
  if (remote.schemaVersion > supportedSchemaVersion) {
    return {
      ok: false,
      reason: 'unsupported-schema',
      remoteSchemaVersion: remote.schemaVersion,
      supportedSchemaVersion,
    }
  }

  const entities = {} as Snapshot['entities']

  for (const name of ENTITY_TABLES) {
    const localTable = local.entities[name] ?? []
    const remoteTable = remote.entities[name] ?? []
    entities[name] = mergeTable(localTable, remoteTable)
  }

  return {
    ok: true,
    merged: {
      // Never downgrade: merging with a stale device must not lower the version
      // the other device is already on.
      schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
      entities,
    },
  }
}

/**
 * The foreign keys between tables.
 *
 * Declared rather than inferred, so adding an entity with a reference is one
 * entry here and `repairReferences` handles it — and so a table with no
 * references is an explicit absence rather than an oversight.
 */
const REFERENCES: { table: EntityTableName; column: string; target: EntityTableName }[] = [
  { table: 'achievements', column: 'jobId', target: 'jobs' },
  { table: 'questions', column: 'categoryId', target: 'questionCategories' },
]

/**
 * Clear references to records that exist in neither snapshot.
 *
 * After a union, references normally resolve, so this is close to a no-op. It
 * matters when a table was lost outright — a hand-edited import, a document
 * written before an entity type existed — where the alternative is records
 * carrying an id that nothing in the app can display.
 *
 * Returns new objects for the entries it changes and reuses every other
 * reference, so the input is never modified. That matters because
 * `mergeSnapshots` shares object identity with its arguments: a repair that
 * edited in place would silently rewrite the caller's snapshot.
 */
export function repairReferences(snapshot: Snapshot): Snapshot {
  const entities = { ...snapshot.entities }

  for (const { table, column, target } of REFERENCES) {
    const targetIds = new Set((entities[target] ?? []).map((record) => record.id))
    const rows = entities[table]
    if (!rows) continue

    let changed = false
    const repaired = rows.map((row) => {
      const value = (row as unknown as Record<string, unknown>)[column]
      if (typeof value !== 'string' || targetIds.has(value)) return row
      changed = true
      // New object rather than mutation — see the note above.
      return { ...row, [column]: '' }
    })
    if (changed) entities[table] = repaired
  }

  return { ...snapshot, entities }
}

/**
 * Settings is a singleton, so the union of two settings rows is still one row.
 *
 * Without this, two devices that each created their own settings row would keep
 * both forever, and which one won would depend on which id sorted higher rather
 * than on which was edited last — so a settings change on a second device would
 * be silently discarded.
 */
export function collapseSingletons(snapshot: Snapshot): Snapshot {
  const rows = snapshot.entities['settings']
  if (!rows || rows.length <= 1) return snapshot

  // Reduced with the same rule as any other conflict, so "newer wins" means the
  // same thing everywhere. Sorting and taking the first would pick by id, which
  // has nothing to do with which edit was more recent.
  const winner = rows.reduce((best, row) => pickWinner(best, row))
  return { ...snapshot, entities: { ...snapshot.entities, settings: [winner] } }
}

/**
 * Drop records that fail their own schema.
 *
 * Lives here rather than in `envelope.ts` because the merge engine is the only
 * caller: a record the app cannot read is something the user has to be told
 * about, and the engine is where that surfaces. See `narrowTables` for the
 * validation itself.
 */
export function rejectInvalidRecords(
  snapshot: Snapshot,
  narrow: (s: Snapshot) => {
    entities: Snapshot['entities']
    rejected: { table: string; id: string; reason: string }[]
  },
): { snapshot: Snapshot; rejected: { table: string; id: string; reason: string }[] } {
  const { entities, rejected } = narrow(snapshot)
  return { snapshot: { ...snapshot, entities }, rejected }
}

/** An empty snapshot at the current schema version. */
export function emptySnapshot(schemaVersion: number): Snapshot {
  const entities = {} as Snapshot['entities']
  for (const name of ENTITY_TABLES) entities[name] = []
  return { schemaVersion, entities }
}
