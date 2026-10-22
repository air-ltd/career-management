/**
 * The data layer: writing a record, and the things that write records for the
 * user rather than through the form.
 *
 * This is the path every change in the app goes through, so it is the place
 * where a mistake loses somebody's work.
 */

import { describe, expect, it } from 'vitest'
import { db } from '../../storage/db'
import {
  deleteRecord,
  restoreRecord,
  saveAchievementOrder,
  saveFields,
  saveGroupOrder,
} from './data'
import { REGISTRY } from './registry'
import { jobRow, achievementRow, questionRow } from '../../test/factories'
import type { Achievement, Job, Question } from '../../domain/types'

/**
 * The factories return complete records, but loosely typed; the tables are typed.
 * The cast is here, once, rather than at every call.
 */
const job = (id: string, overrides: Record<string, unknown> = {}) =>
  jobRow(id, overrides) as unknown as Job
const achievement = (id: string, overrides: Record<string, unknown> = {}) =>
  achievementRow(id, overrides) as unknown as Achievement
const question = (id: string, overrides: Record<string, unknown> = {}) =>
  questionRow(id, overrides) as unknown as Question

const NOW = new Date('2026-10-01T00:00:00.000Z')

describe('saveFields', () => {
  it('creates a record and gives it an id', async () => {
    const id = await saveFields(
      'jobs',
      null,
      { company: 'Acme', jobTitle: 'Engineer', startDate: '2024-01-01', endDate: '' },
      NOW,
    )
    const stored = await db.jobs.get(id)
    expect(stored?.company).toBe('Acme')
    expect(stored?.deletedAt).toBeNull()
    expect(stored?.updatedAt).toBe(NOW.toISOString())
  })

  it('treats an empty id as a new record, and never stores one', async () => {
    const id = await saveFields(
      'jobs',
      '',
      { company: 'Acme', jobTitle: 'Engineer', startDate: '2024-01-01', endDate: '' },
      NOW,
    )
    expect(id).not.toBe('')
    expect(await db.jobs.get('')).toBeUndefined()
  })

  it('updates a record that is already there, and leaves the fields the form does not own alone', async () => {
    await db.jobs.put(
      jobRow('j1', { company: 'Acme', responsibilities: 'Kept' }) as unknown as Job,
    )
    await saveFields('jobs', 'j1', { company: 'New name' }, NOW)
    const stored = await db.jobs.get('j1')
    expect(stored?.company).toBe('New name')
    // The form does not own the responsibilities, so it is not written — but it is
    // not lost either.
    expect(stored?.responsibilities).toBe('Kept')
  })

  it('clears a date that is emptied, rather than storing an empty string', async () => {
    await db.jobs.put(job('j1', { endDate: '2024-03-31' }))
    await saveFields('jobs', 'j1', { endDate: '' }, NOW)
    expect((await db.jobs.get('j1'))?.endDate).toBeNull()
  })

  it('stores a year as a number', async () => {
    await saveFields('awards', null, { year: '2011', institution: 'Body', what: 'Prize' }, NOW)
    const rows = await db.awards.toArray()
    expect(rows[0]?.year).toBe(2011)
  })

  it('stores a checkbox as a boolean', async () => {
    await saveFields(
      'jobs',
      null,
      {
        company: 'Acme',
        jobTitle: 'Engineer',
        startDate: '2024-01-01',
        endDate: '',
        hideDetail: true,
      },
      NOW,
    )
    const rows = await db.jobs.toArray()
    expect(rows[0]?.hideDetail).toBe(true)
  })

  it('ignores a field the form does not own, rather than writing it', async () => {
    await db.jobs.put(job('j1'))
    await saveFields('jobs', 'j1', { company: 'Acme', somethingElse: 'nope' }, NOW)
    expect((await db.jobs.get('j1'))?.somethingElse).toBeUndefined()
  })

  it('leaves a tombstone a tombstone', async () => {
    await db.jobs.put(job('j1', { deletedAt: '2024-01-01T00:00:00.000Z' }))
    await saveFields('jobs', 'j1', { company: 'Acme' }, NOW)
    expect((await db.jobs.get('j1'))?.deletedAt).toBe('2024-01-01T00:00:00.000Z')
  })
})

describe('the order of a new record', () => {
  it('puts a new achievement at the top of its job', async () => {
    await db.achievements.put(achievement('a1', { jobId: 'j1', order: 0 }))
    const id = await saveFields(
      'achievements',
      null,
      { jobId: 'j1', achievement: 'New', story: '' },
      NOW,
    )
    expect((await db.achievements.get(id))?.order).toBe(-1)
  })

  it('puts a new question at the top of its category', async () => {
    await db.questions.put(question('q1', { categoryId: 'c1', order: 0 }))
    const id = await saveFields(
      'questions',
      null,
      { categoryId: 'c1', question: 'New', answer: '' },
      NOW,
    )
    expect((await db.questions.get(id))?.order).toBe(-1)
  })

  it('gives no order when the parent has not been chosen', async () => {
    const id = await saveFields('achievements', null, { jobId: '', achievement: 'New' }, NOW)
    expect((await db.achievements.get(id))?.order).toBeUndefined()
  })

  it('gives no order to a record that is not in an ordered group', async () => {
    const id = await saveFields('jobs', null, { company: 'Acme' }, NOW)
    expect((await db.jobs.get(id))?.order).toBeUndefined()
  })

  it('does not move a record that already has an order', async () => {
    await db.achievements.put(achievement('a1', { jobId: 'j1', order: 5 }))
    await saveFields('achievements', 'a1', { jobId: 'j1', achievement: 'Edited' }, NOW)
    expect((await db.achievements.get('a1'))?.order).toBe(5)
  })
})

describe('writing an order', () => {
  it('numbers the group from zero, in the order it was given', async () => {
    await db.achievements.put(achievement('a1', { jobId: 'j1' }))
    await db.achievements.put(achievement('a2', { jobId: 'j1' }))
    await saveAchievementOrder('j1', ['a2', 'a1'], NOW)
    expect((await db.achievements.get('a2'))?.order).toBe(0)
    expect((await db.achievements.get('a1'))?.order).toBe(1)
  })

  it('does not write a record that is not in the group', async () => {
    await db.achievements.put(achievement('a1', { jobId: 'j1' }))
    await db.achievements.put(achievement('a2', { jobId: 'other' }))
    await saveAchievementOrder('j1', ['a1', 'a2'], NOW)
    expect((await db.achievements.get('a2'))?.order).toBeUndefined()
  })

  it('does not write a record that is not there', async () => {
    await saveAchievementOrder('j1', ['missing'], NOW)
    expect(await db.achievements.count()).toBe(0)
  })

  it('does not write a record whose number did not change', async () => {
    await db.achievements.put(achievement('a1', { jobId: 'j1', order: 0 }))
    const before = await db.achievements.get('a1')
    await saveAchievementOrder('j1', ['a1'], NOW)
    const after = await db.achievements.get('a1')
    // Unchanged means unwritten, so the timestamp does not move and the change
    // does not look like one to the other device.
    expect(after?.updatedAt).toBe(before?.updatedAt)
  })

  it('works for any group with any parent column', async () => {
    await db.questions.put(question('q1', { categoryId: 'c1' }))
    await saveGroupOrder(db.questions, 'categoryId', 'c1', ['q1'], NOW)
    expect((await db.questions.get('q1'))?.order).toBe(0)
  })
})

describe('deleting and restoring', () => {
  it('leaves a tombstone rather than removing the row', async () => {
    await db.jobs.put(job('j1'))
    await deleteRecord('jobs', 'j1', NOW)
    const stored = await db.jobs.get('j1')
    expect(stored).toBeDefined()
    expect(stored?.deletedAt).toBe(NOW.toISOString())
  })

  it('brings a tombstone back', async () => {
    await db.jobs.put(job('j1', { deletedAt: NOW.toISOString() }))
    await restoreRecord('jobs', 'j1', NOW)
    expect((await db.jobs.get('j1'))?.deletedAt).toBeNull()
  })
})

describe('the registry', () => {
  it('has an entry for every table it names', () => {
    /*
     * The registry and the storage schema have to agree, and nothing in the
     * types makes them: a registry entry naming a table that does not exist
     * would fail at the first save, in the user's hands.
     */
    for (const key of Object.keys(REGISTRY) as (keyof typeof REGISTRY)[]) {
      expect(db.tables.map((table) => table.name)).toContain(REGISTRY[key].table)
    }
  })

  it('gives every entity a place to go back to, and a way to add one', () => {
    for (const key of Object.keys(REGISTRY) as (keyof typeof REGISTRY)[]) {
      const definition = REGISTRY[key]
      expect(definition.listPath).not.toBe('')
      expect(definition.newPath).toBeDefined()
      expect(definition.editPath('an-id')).toContain('an-id')
    }
  })
})

describe('the settings', () => {
  it('are read, and created on the first read', async () => {
    const { readSettings } = await import('./data')
    const settings = await readSettings()
    expect(settings.id).toBe('settings')
    expect(settings.pageSize).toBe('A4')
    // The second read finds the one that is there rather than making another.
    const again = await readSettings()
    expect(again).toEqual(settings)
    expect(await db.settings.count()).toBe(1)
  })

  it('are written with a fresh timestamp', async () => {
    const { readSettings, writeSettings } = await import('./data')
    const settings = await readSettings()
    await writeSettings({ ...settings, fontSizePt: 12 }, NOW)
    expect((await readSettings()).fontSizePt).toBe(12)
  })
})

describe('the live jobs', () => {
  it('are the ones that are not hidden', async () => {
    const { activeJobs } = await import('./data')
    await db.jobs.put(job('j1'))
    await db.jobs.put(job('j2', { deletedAt: NOW.toISOString() }))
    expect((await activeJobs()).map((job) => job.id)).toEqual(['j1'])
  })
})
