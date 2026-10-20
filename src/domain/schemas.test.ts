import { describe, expect, it } from 'vitest'
import { achievementSchema, templateSchema } from './types'

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
