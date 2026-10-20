/**
 * The storage primitives.
 *
 * The layer every write in the app goes through. The properties that matter here
 * are about what a write does to the rest of the app: it announces itself, it
 * keeps a tombstone rather than removing a row, and it stamps the moment it
 * happened.
 */

import { describe, expect, it } from 'vitest'
import { db } from './db'
import {
  create,
  erase,
  getById,
  listActive,
  listAll,
  newId,
  recordsEqual,
  restore,
  save,
  softDelete,
  tableFor,
} from './repository'
import { jobRow } from '../test/factories'
import type { Job, Mergeable } from '../domain/types'

/**
 * The factories return complete records, but loosely typed; the tables are typed.
 * The cast is here, once, rather than at every call.
 */
const job = (id: string, overrides: Record<string, unknown> = {}) =>
  jobRow(id, overrides) as unknown as Job

const NOW = new Date('2026-10-01T00:00:00.000Z')

describe('ids', () => {
  it('are not the same twice', () => {
    expect(newId()).not.toBe(newId())
    expect(newId()).not.toBe('')
  })
})

describe('reading', () => {
  it('lists everything, tombstones included', async () => {
    await db.jobs.put(job('j1'))
    await db.jobs.put(job('j2', { deletedAt: NOW.toISOString() }))
    expect(await listAll(db.jobs)).toHaveLength(2)
  })

  it('lists only the live ones when asked', async () => {
    await db.jobs.put(job('j1'))
    await db.jobs.put(job('j2', { deletedAt: NOW.toISOString() }))
    expect((await listActive(db.jobs)).map((job) => job.id)).toEqual(['j1'])
  })

  it('finds a record by its id, and says so when it is not there', async () => {
    await db.jobs.put(job('j1'))
    expect((await getById(db.jobs, 'j1'))?.company).toBe('Acme')
    expect(await getById(db.jobs, 'missing')).toBeUndefined()
  })
})

describe('writing', () => {
  it('stamps the moment it happened', async () => {
    const saved = await save(db.jobs, job('j1'), NOW)
    expect(saved.updatedAt).toBe(NOW.toISOString())
    expect((await db.jobs.get('j1'))?.updatedAt).toBe(NOW.toISOString())
  })

  it('creates a record with an id and a tombstone of nothing', async () => {
    const created = await create(
      db.jobs,
      {
        company: 'Acme',
        jobTitle: 'Engineer',
        startDate: '2024-01-01',
        endDate: null,
        responsibilities: '',
        story: '',
      },
      NOW,
    )
    expect(created.id).not.toBe('')
    expect(created.deletedAt).toBeNull()
    expect((await db.jobs.get(created.id))?.company).toBe('Acme')
  })
})

describe('deleting', () => {
  it('leaves a tombstone rather than removing the row (D51)', async () => {
    await db.jobs.put(job('j1'))
    await softDelete(db.jobs, 'j1', NOW)
    const stored = await db.jobs.get('j1')
    expect(stored).toBeDefined()
    expect(stored?.deletedAt).toBe(NOW.toISOString())
  })

  it('does nothing for a record that is not there', async () => {
    await softDelete(db.jobs, 'missing', NOW)
    expect(await db.jobs.count()).toBe(0)
  })

  it('brings a tombstone back, with the same instant for both fields', async () => {
    await db.jobs.put(job('j1', { deletedAt: NOW.toISOString() }))
    await restore(db.jobs, 'j1', NOW)
    const stored = await db.jobs.get('j1')
    expect(stored?.deletedAt).toBeNull()
    // The same instant on both, so the merge resolves the restore by exactly the
    // same last-write-wins rule as any other edit (SY20).
    expect(stored?.updatedAt).toBe(NOW.toISOString())
  })

  it('does nothing when restoring a record that is not there', async () => {
    await restore(db.jobs, 'missing', NOW)
    expect(await db.jobs.count()).toBe(0)
  })

  it('erases a record outright, for the import path', async () => {
    await db.jobs.put(job('j1'))
    await erase(db.jobs, 'j1')
    expect(await db.jobs.get('j1')).toBeUndefined()
  })
})

describe('comparing records', () => {
  it('says two records are the same when every field is', () => {
    expect(recordsEqual(job('j1'), job('j1'))).toBe(true)
  })

  it('says two records differ when any field does', () => {
    expect(recordsEqual(job('j1'), job('j1', { company: 'Other' }))).toBe(false)
  })

  it('does not care about the order the fields are in', () => {
    const a: Mergeable = { id: 'j1', updatedAt: 'x', deletedAt: null }
    const b: Mergeable = { deletedAt: null, updatedAt: 'x', id: 'j1' }
    expect(recordsEqual(a, b)).toBe(true)
  })
})

describe('the table for a name', () => {
  it('is the table the name means', () => {
    expect(tableFor('jobs').name).toBe('jobs')
  })
})
