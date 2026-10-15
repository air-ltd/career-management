/**
 * Record factories for tests.
 *
 * Every factory returns a complete, valid record with sensible defaults, so a
 * test only states the one field it cares about. A partial builder that leaves
 * fields out would let a test pass against a record the app would reject, which
 * is how a schema test stops testing the schema.
 *
 * The return type is deliberately loose: merge and the envelope deal in records
 * whose full shape is not statically known, and the entity schemas are what
 * actually guarantee the fields.
 */

import type { Mergeable } from '../domain/types'

export type Row = Mergeable & Record<string, unknown>

const AT_1 = '1970-01-01T00:00:01.000Z'
const AT_2 = '1970-01-01T00:00:02.000Z'

function base(id: string, updatedAt: string, deletedAt: string | null = null): Row {
  return { id, updatedAt, deletedAt }
}

export function jobRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return {
    ...base(id, AT_1),
    startDate: '2020-01-01',
    endDate: null,
    company: 'Acme',
    jobTitle: 'Engineer',
    responsibilities: '',
    story: '',
    ...overrides,
  }
}

export function achievementRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return {
    ...base(id, AT_1),
    jobId: 'job-1',
    achievement: 'Did a thing',
    story: '',
    ...overrides,
  }
}

export function awardRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return {
    ...base(id, AT_1),
    year: 2024,
    institution: 'University',
    what: 'Degree',
    story: '',
    ...overrides,
  }
}

export function educationRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return awardRow(id, overrides)
}

export function profileRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return {
    ...base(id, AT_1),
    name: 'Domestic',
    title: 'Engineer',
    email: 'someone@example.com',
    address: '',
    phone: '',
    ...overrides,
  }
}

export function questionCategoryRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return { ...base(id, AT_1), title: 'Behavioural', story: '', ...overrides }
}

export function questionRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return {
    ...base(id, AT_1),
    categoryId: 'cat-1',
    question: 'Why us?',
    answer: '',
    ...overrides,
  }
}

/** A timestamp for tests that need to order records. */
export function at(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

export { AT_1, AT_2 }
