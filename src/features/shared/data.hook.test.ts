/**
 * The hooks that read the document.
 *
 * The property that matters is that a change anywhere is picked up: the editor
 * and the document page are separate parts of the tree reading the same tables,
 * and a save in one has to show up in the other without a reload.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../../storage/db'
import { useFieldContext, useRecords } from './data'
import { erase, save } from '../../storage/repository'
import { jobRow, questionCategoryRow } from '../../test/factories'
import type { Job, QuestionCategory } from '../../domain/types'

/**
 * The factories return complete records, but loosely typed; the tables are typed.
 * The cast is here, once, rather than at every call.
 */
const job = (id: string) => jobRow(id) as unknown as Job

const NOW = new Date('2026-10-01T00:00:00.000Z')

describe('useRecords', () => {
  it('reads the table', async () => {
    await db.jobs.put(job('j1'))
    const { result } = renderHook(() => useRecords('jobs'))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.records.map((job) => job.id)).toEqual(['j1'])
  })

  it('picks up a record that is written after it mounted', async () => {
    /*
     * The editor and the document page read the same tables. A save in one has
     * to show up in the other, and the only thing that says so is the revision
     * counter.
     */
    const { result } = renderHook(() => useRecords('jobs'))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    // Through the app's write path, which is what announces the change: a write
    // that skipped the announcement would be a change the other view never sees.
    await act(async () => {
      await save(db.jobs, job('j1'), NOW)
      await save(db.jobs, job('j2'), NOW)
    })
    await waitFor(() => {
      expect(result.current.records).toHaveLength(2)
    })
  })

  it('picks up a record that is deleted after it mounted', async () => {
    await db.jobs.put(job('j1'))
    const { result } = renderHook(() => useRecords('jobs'))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await act(async () => {
      await erase(db.jobs, 'j1')
    })
    await waitFor(() => {
      expect(result.current.records).toHaveLength(0)
    })
  })
})

describe('useFieldContext', () => {
  it('reads the jobs and the categories the forms need', async () => {
    await db.jobs.put(job('j1'))
    await db.questionCategories.put(questionCategoryRow('c1') as unknown as QuestionCategory)
    const { result } = renderHook(() => useFieldContext(NOW))
    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1)
    })
    expect(result.current.questionCategories.map((category) => category.id)).toEqual(['c1'])
    expect(result.current.now).toBe(NOW)
  })
})
