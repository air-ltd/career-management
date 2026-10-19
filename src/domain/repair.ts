/**
 * Repairing records the app cannot address.
 *
 * A record with a blank id is not merely untidy — it is unreachable. The editor
 * looks a record up by id, merge keys on it, and a blank one collides with every
 * other blank one. Such a record cannot be edited, cannot be merged, and would
 * have every subsequent save overwrite it.
 *
 * This gives those records an id so their content becomes reachable again. It
 * changes nothing else about them, and it is not a guess about meaning: the text,
 * the dates and the links are all left exactly as written.
 *
 * It is a repair rather than a rejection on purpose. A document that refuses to
 * load because of one unusable record cannot be repaired *by syncing* — the very
 * thing that would fix it is the thing that is blocked — so the broken record
 * just sits there permanently, unreachable, and every sync reports an error the
 * user has no way to clear.
 *
 * Pure, with the id source injected, so it can be property-tested without a
 * random number generator and behaves identically in a test and in the app.
 */

import { ENTITY_TABLES, type Snapshot } from './types'

export type IdFactory = () => string

export interface RepairResult {
  snapshot: Snapshot
  /** One entry per repaired record, for the log. */
  repaired: { table: string; previous: string }[]
  /**
   * Records that had no usable id and could not be given one — the generator
   * returned something blank, or collided with a record already present.
   * Reported rather than silently kept broken.
   */
  unrepairable: { table: string }[]
}

/** A blank or whitespace-only id. */
function isBlankId(id: unknown): boolean {
  return typeof id !== 'string' || id.trim() === ''
}

/**
 * Give every unusable record a fresh, unique id.
 *
 * Uniqueness is checked against the ids already in the table as well as the ones
 * assigned here, because a generated id colliding with an existing record would
 * merge two records into one — the exact data loss this is meant to prevent.
 */
export function repairUnusableIds(snapshot: Snapshot, makeId: IdFactory): RepairResult {
  const entities = { ...snapshot.entities }
  const repaired: RepairResult['repaired'] = []
  const unrepairable: RepairResult['unrepairable'] = []

  for (const name of ENTITY_TABLES) {
    const rows = entities[name]
    if (!rows) continue

    const taken = new Set<string>()
    for (const record of rows) {
      if (typeof record.id === 'string' && record.id.trim() !== '') taken.add(record.id)
    }

    let changed = false
    const next = rows.map((record) => {
      if (!isBlankId(record.id)) return record

      let candidate = makeId()
      // Bounded rather than looping forever: a generator that cannot produce a
      // unique id is broken, and spinning on it would hang the sync.
      for (let attempt = 0; attempt < 5 && taken.has(candidate); attempt += 1) {
        candidate = makeId()
      }
      if (candidate.trim() === '' || taken.has(candidate)) {
        unrepairable.push({ table: name })
        return record
      }

      taken.add(candidate)
      changed = true
      repaired.push({ table: name, previous: String(record.id) })
      return { ...record, id: candidate }
    })

    if (changed) entities[name] = next
  }

  return { snapshot: { ...snapshot, entities }, repaired, unrepairable }
}
