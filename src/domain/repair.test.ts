/**
 * Repairing unusable records.
 *
 * A record with a blank id is unreachable: the editor looks records up by id,
 * merge keys on it, and a blank one collides with every other blank one. These
 * tests pin the behaviour that makes such a record recoverable rather than
 * permanent.
 */

import { describe, expect, it } from 'vitest'
import { repairUnusableIds } from './repair'
import { emptySnapshot } from './merge'
import { ENTITY_TABLES, type Mergeable, type Snapshot } from './types'

let counter = 0
/** Deterministic ids, so a test never depends on randomness. */
function makeId(): string {
  counter += 1
  return `generated-${String(counter)}`
}

function withRows(
  rows: Partial<Record<(typeof ENTITY_TABLES)[number], Mergeable[]>>,
): Snapshot {
  const base = emptySnapshot(1)
  return {
    schemaVersion: 1,
    entities: { ...base.entities, ...rows },
  }
}

const question = (id: string, text: string): Mergeable =>
  ({
    id,
    updatedAt: '1970-01-01T00:00:01.000Z',
    deletedAt: null,
    categoryId: 'c1',
    question: text,
    answer: '',
  }) as unknown as Mergeable

describe('repairUnusableIds', () => {
  it('gives a blank id a new one, and changes nothing else', () => {
    const before = question('', 'Why us?')
    const result = repairUnusableIds(withRows({ questions: [before] }), makeId)

    const fixed = result.snapshot.entities['questions']?.[0]
    expect(fixed?.id).not.toBe('')
    expect(fixed?.id).toBeTruthy()

    // The content is the user's, and it is left exactly as written.
    const after = fixed as unknown as Record<string, unknown>
    expect(after['question']).toBe('Why us?')
    expect(after['answer']).toBe('')
    expect(after['updatedAt']).toBe(before.updatedAt)

    expect(result.repaired).toEqual([{ table: 'questions', previous: '' }])
  })

  it('reports what it repaired, so the app can say so', () => {
    const result = repairUnusableIds(
      withRows({ questions: [question('', 'a'), question('', 'b')] }),
      makeId,
    )
    expect(result.repaired).toHaveLength(2)
    expect(result.unrepairable).toHaveLength(0)
  })

  it('never collides a new id with one already in use', () => {
    // A generator that hands back an existing id is the case that would merge two
    // records into one, which is the data loss this exists to prevent.
    const existing = question('job-1', 'taken')
    const result = repairUnusableIds(
      withRows({ questions: [existing, question('', 'broken')] }),
      () => 'job-1',
    )
    // Exhausted its attempts: reported rather than silently merged.
    expect(result.unrepairable).toHaveLength(1)
    expect(result.snapshot.entities['questions']?.[1]?.id).toBe('')
    expect(result.snapshot.entities['questions']?.[0]?.id).toBe('job-1')
  })

  it('retries rather than giving up at the first collision', () => {
    let call = 0
    const result = repairUnusableIds(
      withRows({ questions: [question('a', 'x'), question('', 'y')] }),
      () => {
        call += 1
        return call === 1 ? 'a' : 'b'
      },
    )
    expect(result.repaired).toHaveLength(1)
    expect(result.snapshot.entities['questions']?.[1]?.id).toBe('b')
  })

  it('leaves well-formed records exactly as they are', () => {
    const good = question('keep-me', 'fine')
    const result = repairUnusableIds(withRows({ questions: [good] }), makeId)

    expect(result.repaired).toHaveLength(0)
    // Same object, not a copy: nothing about a good record was touched.
    expect(result.snapshot.entities['questions']?.[0]).toBe(good)
  })

  it('treats a whitespace-only id as unusable', () => {
    const result = repairUnusableIds(withRows({ questions: [question('   ', 'a')] }), makeId)
    expect(result.repaired).toHaveLength(1)
    expect(result.snapshot.entities['questions']?.[0]?.id).not.toBe('   ')
  })

  it('leaves the rest of the snapshot untouched', () => {
    const input = withRows({ questions: [question('', 'a')], jobs: [] })
    const result = repairUnusableIds(input, makeId)
    expect(result.snapshot.schemaVersion).toBe(input.schemaVersion)
    expect(result.snapshot.entities['jobs']).toBe(input.entities['jobs'])
  })
})
