/**
 * Merge tests.
 *
 * These are the tests that matter most in the project. A wrong merge loses
 * somebody's document, and a *non-deterministic* merge means two devices never
 * converge while reporting no error at all — so the determinism cases below are
 * not redundant with the correctness ones.
 */

import { describe, expect, it } from 'vitest'
import {
  canonicalStringify,
  collapseSingletons,
  emptySnapshot,
  mergeSnapshots,
  repairReferences,
} from './merge'
import { ENTITY_TABLES, type Mergeable, type Snapshot } from './types'
import { at, achievementRow, jobRow, questionRow } from '../test/factories'

/** A job row with the merge-relevant fields set; everything else defaulted. */
function row(id: string, overrides: Record<string, unknown> = {}): Mergeable {
  return jobRow(id, { updatedAt: at(1000), ...overrides })
}

function snapshot(entities: Partial<Snapshot['entities']>, schemaVersion = 1): Snapshot {
  const base = emptySnapshot(schemaVersion)
  return { schemaVersion, entities: { ...base.entities, ...entities } }
}

describe('canonicalStringify', () => {
  it('sorts keys recursively so equal data always serialises identically', () => {
    expect(canonicalStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalStringify({ a: { c: 3, d: 2 }, b: 1 }),
    )
  })

  it('is not fooled by key insertion order, which is how two devices disagreed', () => {
    // Plain JSON.stringify emits these differently, so a tiebreak based on it
    // would pick a different winner on each device and neither would be wrong.
    const builtLeftFirst = JSON.stringify({ id: 'x', text: 'a' })
    const builtRightFirst = JSON.stringify({ text: 'a', id: 'x' })
    expect(builtLeftFirst).not.toBe(builtRightFirst)
    expect(canonicalStringify({ id: 'x', text: 'a' })).toBe(
      canonicalStringify({ text: 'a', id: 'x' }),
    )
  })

  it('drops undefined members so an absent field and an undefined one agree', () => {
    expect(canonicalStringify({ a: 1, b: undefined })).toBe(canonicalStringify({ a: 1 }))
  })

  it('handles arrays and null without stringifying them as "[object Object]"', () => {
    expect(canonicalStringify([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalStringify(null)).toBe('null')
  })
})

describe('mergeSnapshots', () => {
  it('is a union: a record on only one side survives', () => {
    const outcome = mergeSnapshots(
      snapshot({ jobs: [row('local')] }),
      snapshot({ jobs: [row('remote')] }),
      1,
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.merged.entities.jobs.map((r) => r.id)).toEqual(['local', 'remote'])
  })

  it('keeps the newer record when both sides changed the same one', () => {
    const outcome = mergeSnapshots(
      snapshot({ jobs: [row('a', { updatedAt: at(200) })] }),
      snapshot({ jobs: [row('a', { updatedAt: at(100) })] }),
      1,
    )
    if (!outcome.ok) throw new Error('expected a merge')
    expect(outcome.merged.entities.jobs[0]?.updatedAt).toBe(at(200))
  })

  it('resolves an exact tie the same way on both sides, whichever is "local"', () => {
    const localRecord = row('a', { updatedAt: at(100), text: 'left' })
    const remoteRecord = row('a', { updatedAt: at(100), text: 'right' })

    const oneWay = mergeSnapshots(
      snapshot({ jobs: [localRecord] }),
      snapshot({ jobs: [remoteRecord] }),
      1,
    )
    const otherWay = mergeSnapshots(
      snapshot({ jobs: [remoteRecord] }),
      snapshot({ jobs: [localRecord] }),
      1,
    )

    if (!oneWay.ok || !otherWay.ok) throw new Error('expected a merge')
    // The whole point: both devices independently arrive at the same document.
    expect(canonicalStringify(oneWay.merged)).toBe(canonicalStringify(otherWay.merged))
  })

  it('is commutative, so swapping sides cannot change the answer', () => {
    const a = snapshot({
      jobs: [row('1', { updatedAt: at(200) }), row('2', { updatedAt: at(50) })],
    })
    const b = snapshot({
      jobs: [row('1', { updatedAt: at(100) }), row('3', { updatedAt: at(300) })],
    })

    const ab = mergeSnapshots(a, b, 1)
    const ba = mergeSnapshots(b, a, 1)
    if (!ab.ok || !ba.ok) throw new Error('expected a merge')

    expect(canonicalStringify(ab.merged)).toBe(canonicalStringify(ba.merged))
  })

  it('is idempotent, so repeated cycles converge instead of drifting', () => {
    const a = snapshot({ jobs: [row('1', { updatedAt: at(200) })] })
    const b = snapshot({ jobs: [row('2', { updatedAt: at(300) })] })

    const first = mergeSnapshots(a, b, 1)
    if (!first.ok) throw new Error('expected a merge')

    // Merging the result with either input again must change nothing.
    const again = mergeSnapshots(first.merged, b, 1)
    const andAgain = mergeSnapshots(a, first.merged, 1)
    if (!again.ok || !andAgain.ok) throw new Error('expected a merge')

    expect(canonicalStringify(again.merged)).toBe(canonicalStringify(first.merged))
    expect(canonicalStringify(andAgain.merged)).toBe(canonicalStringify(first.merged))
  })

  it('sorts by id so every device produces identical bytes', () => {
    const outcome = mergeSnapshots(
      snapshot({ jobs: [row('c'), row('a'), row('b')] }),
      emptySnapshot(1),
      1,
    )
    if (!outcome.ok) throw new Error('expected a merge')
    expect(outcome.merged.entities.jobs.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('treats a deletion as an ordinary edit, resolved by the same rule', () => {
    const outcome = mergeSnapshots(
      snapshot({ jobs: [row('a', { updatedAt: at(200) })] }),
      snapshot({ jobs: [row('a', { updatedAt: at(300), deletedAt: at(300) })] }),
      1,
    )
    if (!outcome.ok) throw new Error('expected a merge')
    expect(outcome.merged.entities.jobs[0]?.deletedAt).toBe(at(300))
  })

  it('keeps a tombstone so an offline device cannot resurrect a deletion (D51)', () => {
    const outcome = mergeSnapshots(
      emptySnapshot(1),
      snapshot({ jobs: [row('a', { deletedAt: at(1) })] }),
      1,
    )
    if (!outcome.ok) throw new Error('expected a merge')
    expect(outcome.merged.entities.jobs).toHaveLength(1)
    expect(outcome.merged.entities.jobs[0]?.deletedAt).toBe(at(1))
  })

  it('does not resurrect when the older copy is the local one', () => {
    const outcome = mergeSnapshots(
      snapshot({ jobs: [row('a', { updatedAt: at(100) })] }),
      snapshot({ jobs: [row('a', { updatedAt: at(500), deletedAt: at(500) })] }),
      1,
    )
    if (!outcome.ok) throw new Error('expected a merge')
    expect(outcome.merged.entities.jobs[0]?.deletedAt).toBe(at(500))
  })

  it('refuses a remote document from a newer schema rather than interpreting it', () => {
    const outcome = mergeSnapshots(snapshot({}, 1), snapshot({}, 3), 1)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('unsupported-schema')
    expect(outcome.remoteSchemaVersion).toBe(3)
  })

  it('never downgrades the schema version by merging with a stale device', () => {
    const outcome = mergeSnapshots(snapshot({}, 4), snapshot({}, 2), 4)
    if (!outcome.ok) throw new Error('expected a merge')
    expect(outcome.merged.schemaVersion).toBe(4)
  })

  it('returns an array for every table, even one empty on both sides', () => {
    const outcome = mergeSnapshots(snapshot({ jobs: [row('a')] }), snapshot({}), 1)
    if (!outcome.ok) throw new Error('expected a merge')
    expect(outcome.merged.entities.jobs).toHaveLength(1)
    for (const name of ENTITY_TABLES) {
      expect(Array.isArray(outcome.merged.entities[name])).toBe(true)
    }
  })
})

describe('repairReferences', () => {
  it('clears an achievement pointing at a job that exists in neither snapshot', () => {
    const repaired = repairReferences(
      snapshot({ achievements: [achievementRow('ach', { jobId: 'gone' })], jobs: [] }),
    )
    expect((repaired.entities.achievements[0] as unknown as { jobId: string }).jobId).toBe('')
  })

  it('leaves a valid reference alone and reuses the same object', () => {
    const achievement = achievementRow('ach', { jobId: 'job' })
    const repaired = repairReferences(
      snapshot({ achievements: [achievement], jobs: [row('job')] }),
    )
    expect(repaired.entities.achievements[0]).toBe(achievement)
  })

  it('does not modify its input', () => {
    // `mergeSnapshots` shares object identity with its arguments, so a repair
    // that edited in place would silently rewrite the caller's snapshot.
    const input = snapshot({ achievements: [achievementRow('ach', { jobId: 'gone' })] })
    repairReferences(input)
    expect((input.entities.achievements[0] as unknown as { jobId: string }).jobId).toBe('gone')
  })

  it('repairs the question to category reference too', () => {
    const repaired = repairReferences(
      snapshot({ questions: [questionRow('q', { categoryId: 'gone' })] }),
    )
    expect(
      (repaired.entities.questions[0] as unknown as { categoryId: string }).categoryId,
    ).toBe('')
  })
})

describe('collapseSingletons', () => {
  it('keeps one settings row, and the more recent one, when two devices made one each', () => {
    const collapsed = collapseSingletons(
      snapshot({
        settings: [row('a', { updatedAt: at(100) }), row('b', { updatedAt: at(200) })],
      }),
    )
    expect(collapsed.entities.settings).toHaveLength(1)
    // Recency, not id order: picking by id would silently discard whichever edit
    // happened to sort lower.
    expect(collapsed.entities.settings[0]?.updatedAt).toBe(at(200))
  })

  it('leaves a single settings row untouched', () => {
    const input = snapshot({ settings: [row('a')] })
    expect(collapseSingletons(input)).toBe(input)
  })
})
