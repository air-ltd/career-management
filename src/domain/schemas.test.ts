import { describe, expect, it } from 'vitest'
import { achievementSchema, templateSchema } from './types'
import { headingFor, nameFor, resolveOrder } from './sections'

const achievement = {
  id: 'a',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
  jobId: 'j',
  achievement: 'x',
  story: '',
}

describe('the achievement schema', () => {
  it('rejects an order that is not a finite number', () => {
    expect(achievementSchema.safeParse({ ...achievement, order: Number.NaN }).success).toBe(
      false,
    )
    expect(achievementSchema.safeParse({ ...achievement, order: 'two' }).success).toBe(false)
    expect(
      achievementSchema.safeParse({ ...achievement, order: Number.POSITIVE_INFINITY }).success,
    ).toBe(false)
  })
  it('accepts an order that is a number, and no order at all', () => {
    expect(achievementSchema.safeParse({ ...achievement, order: 3 }).success).toBe(true)
    expect(achievementSchema.safeParse(achievement).success).toBe(true)
  })
})

describe('the template schema', () => {
  const base = {
    id: 't',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    name: 'x',
    builtIn: false,
    pageSize: 'A4',
    fontSizePt: 10,
    density: 'normal',
    format: 'compressed',
    targetPages: 1,
    sectionOrder: [],
    sections: [],
    sectionHeadings: {},
  }
  it('keeps a field it does not know about, for a later build', () => {
    const result = templateSchema.safeParse({ ...base, somethingNew: 'from a later build' })
    expect(result.success).toBe(true)
  })
})

describe('the sections', () => {
  it('keeps a section it does not know, rather than renumbering the ones it does', () => {
    /*
     * A document written by a later build may have a section this one has never
     * heard of. The stored order keeps it; the order this build draws from
     * leaves it out, and the sections it does know keep their places.
     */
    const order = resolveOrder(['somethingNew', 'awardsEducation', 'workHistory'])
    expect(order).toEqual(['awardsEducation', 'workHistory', 'questions'])
  })

  it('puts a section that is not in the order at the end', () => {
    expect(resolveOrder(['awardsEducation'])).toEqual([
      'awardsEducation',
      'workHistory',
      'questions',
    ])
  })

  it('gives the default order when there is no order', () => {
    expect(resolveOrder(undefined)).toEqual(['workHistory', 'awardsEducation', 'questions'])
  })

  it('names a section it has never heard of, rather than naming it nothing', () => {
    expect(headingFor('somethingNew', undefined)).toBe('somethingNew')
    expect(nameFor('somethingNew', undefined)).toBe('somethingNew')
  })

  it('keeps a heading a template set, including an empty one', () => {
    expect(headingFor('workHistory', { workHistory: 'Experience' })).toBe('Experience')
    // An empty heading is a section with no visible title, which is the work
    // history as it is today.
    expect(headingFor('workHistory', { workHistory: '' })).toBe('')
    expect(nameFor('workHistory', { workHistory: '' })).toBe('Work history')
  })
})
