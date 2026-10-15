/**
 * Local storage.
 *
 * IndexedDB is the source of truth. The remote copy is a convenience and a
 * backup, never a prerequisite (SY1), so nothing here waits on the network.
 */

import Dexie, { type Table } from 'dexie'
import {
  ENTITY_TABLES,
  type Achievement,
  type Award,
  type Education,
  type Job,
  type Mergeable,
  type Profile,
  type Question,
  type QuestionCategory,
  type Settings,
  type Snapshot,
} from '../domain/types'

/**
 * Every table is keyed by string id and indexed on `updatedAt`.
 *
 * `updatedAt` is indexed because the snapshot reader wants whole tables and
 * anything incremental will want the same index. `deletedAt` is deliberately
 * *not* indexed: with no history table (D15) there are few enough records that
 * filtering tombstones in memory is cheaper than maintaining an index nothing
 * queries.
 */
interface AppSchema {
  settings: Table<Settings, string>
  profiles: Table<Profile, string>
  jobs: Table<Job, string>
  achievements: Table<Achievement, string>
  awards: Table<Award, string>
  education: Table<Education, string>
  questionCategories: Table<QuestionCategory, string>
  questions: Table<Question, string>
}

export const db = new Dexie('career-management-doc') as Dexie & AppSchema

/**
 * Schema version 1.
 *
 * Version numbers are never reused or renumbered. A later version is added as a
 * separate `db.version(2)` block below with an upgrade function. This counter
 * describes the local database shape and moves independently of the document's
 * `schemaVersion`, which describes the file.
 */
db.version(1).stores({
  settings: 'id, updatedAt',
  profiles: 'id, updatedAt',
  jobs: 'id, updatedAt',
  achievements: 'id, jobId, updatedAt',
  awards: 'id, updatedAt',
  education: 'id, updatedAt',
  questionCategories: 'id, updatedAt',
  questions: 'id, categoryId, updatedAt',
})

/**
 * A monotonic counter bumped by every write.
 *
 * The sync scheduler subscribes to this rather than being told about changes by
 * whichever view happened to make one (SY24). A write path that forgets to
 * announce itself is the bug this removes: there is nowhere else for the trigger
 * to live, so it cannot be forgotten.
 */
let revision = 0
const listeners = new Set<() => void>()

export function getRevision(): number {
  return revision
}

export function bumpRevision(): void {
  revision += 1
  for (const listener of listeners) listener()
}

export function subscribeToRevision(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Read every table as a snapshot for the merge engine. */
export async function readSnapshot(schemaVersion: number): Promise<Snapshot> {
  const entities = {} as Snapshot['entities']

  // One transaction across all tables. Reading them separately would let a write
  // landing between two reads produce a snapshot that never existed — and merge
  // would treat that as a real document and publish it.
  await db.transaction('r', db.tables, async () => {
    for (const name of ENTITY_TABLES) {
      entities[name] = (await db.table(name).toArray()) as Mergeable[]
    }
  })

  return { schemaVersion, entities }
}

/**
 * Replace local data with a snapshot, in one transaction.
 *
 * Bulk-put then clear would leave a window where the document is empty and
 * anything reading during it would see a state the user never created.
 * `clear` then `bulkPut` inside a single transaction is atomic, so a reader sees
 * either the old document or the new one, never a half-applied one.
 */
export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of ENTITY_TABLES) {
      const table = db.table(name)
      await table.clear()
      const rows = snapshot.entities[name]
      if (rows.length > 0) {
        await table.bulkPut(rows)
      }
    }
  })
  bumpRevision()
}
