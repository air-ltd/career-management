/**
 * Envelope tests.
 *
 * The behaviour under test is almost entirely failure: a document that is
 * slightly wrong must be refused, because the alternative is a sync that
 * overwrites a good remote copy with a bad interpretation of a broken one.
 */

import { describe, expect, it } from 'vitest'
import {
  FORMAT,
  defaultSettings,
  narrowTables,
  parseEnvelope,
  serialiseEnvelope,
  toEnvelope,
} from './envelope'
import { emptySnapshot } from '../domain/merge'
import { achievementRow, at, jobRow } from '../test/factories'
import type { Envelope } from './envelope'
import type { Mergeable, Snapshot } from '../domain/types'

const AT = at

const job = jobRow

function snapshotOf(jobs: Mergeable[]): Snapshot {
  return { ...emptySnapshot(1), entities: { ...emptySnapshot(1).entities, jobs } }
}

/**
 * The serialised form, typed loosely so a test can corrupt it on purpose —
 * which is the point of most of this file.
 */
interface RawEnvelope {
  format: string
  formatVersion: number
  schemaVersion: number
  exportedAt: string
  counts: Record<string, number>
  data: Record<string, unknown[]>
}

function envelopeOf(snapshot: Snapshot): RawEnvelope {
  return JSON.parse(serialiseEnvelope(toEnvelope(snapshot, new Date(0)))) as RawEnvelope
}

describe('parseEnvelope', () => {
  it('keeps a settings row written before the format setting existed', () => {
    /*
     * `format` was added after documents were already in circulation, and a document
     * without it has to keep working. Required, `narrowTables` would reject the
     * settings row — and a rejected settings row takes the page size, the type size
     * and the profile with it, for a setting that only decides spacing.
     *
     * Checked here rather than through `parseEnvelope` because that is the layer
     * that decides: it validates `id` and leaves every other field alone. The
     * per-record schemas, this one included, are applied by `narrowTables`.
     */
    const settings = {
      id: 'settings',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      activeProfileId: null,
      pageSize: 'A4',
      fontSizePt: 10,
      density: 'normal',
      targetPages: 1,
      // No `format`. That absence is the entire point.
    }
    const { entities, rejected } = narrowTables({
      schemaVersion: 1,
      entities: { ...emptySnapshot(1).entities, settings: [settings] },
    })

    expect(rejected).toEqual([])
    expect(entities.settings).toHaveLength(1)
    const kept = entities.settings[0] as Record<string, unknown> | undefined
    expect(kept?.['format']).toBeUndefined()
    expect(kept?.['pageSize']).toBe('A4')
  })

  it('keeps a job row written before the summary setting existed', () => {
    /*
     * `hideDetail` was added after documents were already in circulation. A job
     * without it is a job that prints in full — the only behaviour there was — so
     * making the field required would reject those rows and take the role with them.
     */
    const jobWithoutIt = job('j1')
    const jobWithIt = job('j2', { hideDetail: true })
    const { entities, rejected } = narrowTables({
      schemaVersion: 1,
      entities: { ...emptySnapshot(1).entities, jobs: [jobWithoutIt, jobWithIt] },
    })

    expect(rejected).toEqual([])
    expect(entities.jobs).toHaveLength(2)
    const plain = entities.jobs[0] as Record<string, unknown> | undefined
    const summarised = entities.jobs[1] as Record<string, unknown> | undefined
    expect(plain?.['hideDetail']).toBeUndefined()
    expect(summarised?.['hideDetail']).toBe(true)
  })

  it('round-trips a document this build wrote', () => {
    const snapshot = snapshotOf([job('a'), job('b', { deletedAt: AT(5) })])
    const result = parseEnvelope(envelopeOf(snapshot), 1)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.entities.jobs).toHaveLength(2)
  })

  it('rejects a file that is not ours, with a message that does not mention Zod', () => {
    const result = parseEnvelope({ hello: 'world' }, 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe('Not a career management document file.')
  })

  it('rejects a non-object rather than listing object-shape issues', () => {
    expect(parseEnvelope('nope', 1)).toEqual({
      ok: false,
      message: 'Not a career management document file.',
    })
    expect(parseEnvelope(null, 1).ok).toBe(false)
    expect(parseEnvelope([], 1).ok).toBe(false)
  })

  it('refuses a file from a newer format version rather than guessing', () => {
    const envelope = envelopeOf(snapshotOf([]))
    envelope.formatVersion = 99
    const result = parseEnvelope(envelope, 1)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/newer version/)
  })

  it('refuses a document whose layout version this build does not understand', () => {
    const envelope = envelopeOf(snapshotOf([]))
    envelope.schemaVersion = 5
    const result = parseEnvelope(envelope, 1)

    expect(result.ok).toBe(false)
    if (result.ok) return
    // The message names both numbers, because "it didn't work" is useless here.
    expect(result.message).toMatch(/5/)
    expect(result.message).toMatch(/1/)
  })

  it('catches a truncated file using the counts check', () => {
    const snapshot = snapshotOf([job('a'), job('b')])
    const envelope = envelopeOf(snapshot)
    // Simulate a file cut short by a quota or an interrupted upload.
    envelope.data['jobs'] = [envelope.data['jobs']?.[0]]

    const result = parseEnvelope(envelope, 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/incomplete/)
  })

  it('does not check counts for a table this build did not parse', () => {
    const envelope = envelopeOf(snapshotOf([job('a')]))
    // A table absent from an older file means "did not exist then", not "empty".
    delete envelope.data['questionCategories']
    delete envelope.counts['questionCategories']

    expect(parseEnvelope(envelope, 1).ok).toBe(true)
  })

  it('preserves unknown fields rather than stripping them (D6)', () => {
    // A document written by a later build, read by this one. Stripping the extra
    // field is how an older client destroys a newer client's data.
    const snapshot = snapshotOf([job('a', { somethingFromTheFuture: 'keep me' })])
    const result = parseEnvelope(envelopeOf(snapshot), 1)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.entities.jobs[0]).toHaveProperty('somethingFromTheFuture', 'keep me')
  })

  it('round-trips through serialisation without changing the bytes', () => {
    const once = serialiseEnvelope(toEnvelope(snapshotOf([job('a')]), new Date(0)))
    const reparsed = JSON.parse(once) as RawEnvelope
    expect(serialiseEnvelope(reparsed as unknown as Envelope)).toBe(once)
  })

  it('writes compact JSON, because these files sync on every change', () => {
    const serialised = serialiseEnvelope(toEnvelope(snapshotOf([job('a')]), new Date(0)))
    expect(serialised).not.toContain('\n')
  })
})

describe('narrowTables', () => {
  it('rejects a job with an impossible date and reports why', () => {
    const snapshot = snapshotOf([job('a', { startDate: '2024-02-31' })])
    const { entities, rejected } = narrowTables(snapshot)

    expect(entities.jobs).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.table).toBe('jobs')
    expect(rejected[0]?.reason).toMatch(/startDate/)
  })

  it('keeps a valid record and reports nothing', () => {
    const { entities, rejected } = narrowTables(snapshotOf([job('a')]))
    expect(entities.jobs).toHaveLength(1)
    expect(rejected).toHaveLength(0)
  })

  it('rejects a date that is well-formed but not a real calendar date', () => {
    const { rejected } = narrowTables(snapshotOf([job('a', { startDate: '2023-02-29' })]))
    expect(rejected).toHaveLength(1)
  })

  it('rejects an achievement with no job, which is the D9 guarantee', () => {
    const snapshot: Snapshot = {
      ...emptySnapshot(1),
      entities: {
        ...emptySnapshot(1).entities,
        achievements: [achievementRow('a', { jobId: '' })],
      },
    }
    const { rejected } = narrowTables(snapshot)
    expect(rejected.some((r) => r.table === 'achievements')).toBe(true)
  })

  it('accepts a valid achievement', () => {
    const snapshot: Snapshot = {
      ...emptySnapshot(1),
      entities: {
        ...emptySnapshot(1).entities,
        achievements: [achievementRow('a', { jobId: 'job-1' })],
      },
    }
    const { entities, rejected } = narrowTables(snapshot)
    expect(entities.achievements).toHaveLength(1)
    expect(rejected).toHaveLength(0)
  })
})

describe('defaultSettings', () => {
  it('starts on A4 at 10pt with a one-page target', () => {
    const settings = defaultSettings(new Date(0))
    expect(settings.pageSize).toBe('A4')
    expect(settings.fontSizePt).toBe(10)
    expect(settings.targetPages).toBe(1)
    expect(settings.activeProfileId).toBeNull()
  })

  it('passes its own schema', () => {
    const snapshot: Snapshot = {
      ...emptySnapshot(1),
      entities: { ...emptySnapshot(1).entities, settings: [defaultSettings(new Date(0))] },
    }
    const { rejected } = narrowTables(snapshot)
    expect(rejected).toHaveLength(0)
  })
})

describe('toEnvelope', () => {
  it('stamps the format this build writes', () => {
    expect(toEnvelope(emptySnapshot(1), new Date(0)).format).toBe(FORMAT)
  })

  it('counts every table, including the empty ones', () => {
    const counts = toEnvelope(snapshotOf([job('a')]), new Date(0)).counts
    expect(counts['jobs']).toBe(1)
    expect(counts['awards']).toBe(0)
  })
})
