/**
 * Reads and writes for one entity table.
 *
 * One generic implementation rather than eight near-identical ones: the tables
 * differ only in their record type, and eight copies of "insert or update, bump
 * the revision" is eight places for the timestamp handling to drift.
 */

import type { Table } from 'dexie'
import { db, bumpRevision } from './db'
import { canonicalStringify } from '../domain/merge'
import type { Mergeable } from '../domain/types'

/** Anything the repository can store. Entities extend this with their own fields. */
export type StoredRecord = Mergeable & Record<string, unknown>

/**
 * Ids are opaque strings.
 *
 * Numeric ids would leak into the sync layer's byte comparisons and the export,
 * and would make it impossible to add a record from somewhere that has no
 * counter. Generation uses `crypto.randomUUID`, which is why this is not a
 * `Math.random` fallback — a collision across two devices would merge two
 * different records into one.
 */
export function newId(): string {
  const webCrypto = globalThis.crypto
  if (!webCrypto?.randomUUID) {
    throw new Error('No secure id source available. This browser cannot store the document.')
  }
  return webCrypto.randomUUID()
}

/** Live records, newest first by `updatedAt`. Tombstones filtered out. */
export function listActive<T extends Mergeable>(table: Table<T, string>): Promise<T[]> {
  return table.filter((record) => record.deletedAt === null).toArray()
}

export function listAll<T extends Mergeable>(table: Table<T, string>): Promise<T[]> {
  return table.toArray()
}

export function getById<T extends Mergeable>(
  table: Table<T, string>,
  id: string,
): Promise<T | undefined> {
  return table.get(id)
}

/**
 * Insert or update, stamping `updatedAt`.
 *
 * `updatedAt` is set here rather than by callers so it cannot be forgotten or set
 * inconsistently — merge compares it on every record, so a record whose timestamp
 * did not move would never win a conflict and would silently lose edits.
 */
export async function save<T extends StoredRecord & Mergeable>(
  table: Table<T, string>,
  record: T,
  now: Date,
): Promise<T> {
  const stamped = { ...record, updatedAt: now.toISOString() }
  await table.put(stamped)
  bumpRevision()
  return stamped
}

export async function create<T extends StoredRecord>(
  table: Table<T & Mergeable, string>,
  fields: Omit<T, 'id' | 'updatedAt' | 'deletedAt'>,
  now: Date,
): Promise<T> {
  const record = {
    ...fields,
    id: newId(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  } as T & Mergeable
  await table.put(record)
  bumpRevision()
  return record
}

/**
 * Mark deleted rather than removing the row (D51).
 *
 * The tombstone is what stops a device that has been offline for a month from
 * resurrecting something the user deleted on another device. It is not garbage;
 * removing the row would make the deletion reversible by an accident of
 * connectivity.
 */
export async function softDelete<T extends Mergeable>(
  table: Table<T, string>,
  id: string,
  now: Date,
): Promise<void> {
  const record = await table.get(id)
  if (!record) return
  await table.put({ ...record, deletedAt: now.toISOString(), updatedAt: now.toISOString() })
  bumpRevision()
}

/**
 * Undo a delete.
 *
 * Also a tombstone, with `deletedAt` set to the same instant as `updatedAt`, so
 * merge resolves the restore by exactly the same last-write-wins rule as any
 * other edit (SY20).
 */
export async function restore<T extends Mergeable>(
  table: Table<T, string>,
  id: string,
  now: Date,
): Promise<void> {
  const record = await table.get(id)
  if (!record) return
  const stamp = now.toISOString()
  await table.put({ ...record, deletedAt: null, updatedAt: stamp })
  bumpRevision()
}

/**
 * Erase a record permanently.
 *
 * Separate from `softDelete` on purpose, and not reachable from any view in this
 * phase. Erasing clears the tombstone, which reopens the resurrection window —
 * another device holding the pre-deletion state would bring it back on the next
 * merge. It exists for the export/import path, where the user is deliberately
 * discarding data rather than hiding it.
 */
export async function erase<T extends Mergeable>(
  table: Table<T, string>,
  id: string,
): Promise<void> {
  await table.delete(id)
  bumpRevision()
}

/** Whether two records differ in any field that would affect the document. */
export function recordsEqual(a: Mergeable, b: Mergeable): boolean {
  return canonicalStringify(a) === canonicalStringify(b)
}

/** The table for a named entity, for the generic snapshot and migration paths. */
export function tableFor(name: Parameters<typeof db.table>[0]) {
  return db.table(name)
}
