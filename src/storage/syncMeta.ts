/**
 * Sync bookkeeping: the last revision and the last successful sync time.
 *
 * Deliberately **not** one of the entity tables, so it is never written to the
 * synchronised file. These are facts about one device's connection, not about
 * the document — a revision from this laptop has no meaning on your phone, and
 * syncing it would have every device overwrite the others' view of when the
 * last sync happened.
 *
 * `lastRev` is write-only (see `engine.ts`): nothing branches on it, because a
 * local-only change leaves the remote revision untouched and comparing revisions
 * concludes there is nothing to publish.
 */

import Dexie, { type Table } from 'dexie'

interface MetaRow {
  key: string
  value: string
}

class SyncMetaDb extends Dexie {
  meta!: Table<MetaRow, string>

  constructor() {
    super('career-management-doc-syncmeta')
    this.version(1).stores({ meta: 'key' })
  }
}

const db = new SyncMetaDb()

export type SyncMetaKey = 'lastRev' | 'lastSyncAt'

export async function writeSyncMeta(key: SyncMetaKey, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

export async function readSyncMeta(key: SyncMetaKey): Promise<string | null> {
  const row = await db.meta.get(key)
  return row?.value ?? null
}

/** Reset for tests. A separate Dexie instance, so the shared setup cannot clear it. */
export async function clearSyncMetaForTests(): Promise<void> {
  await db.delete()
  await db.open()
}
