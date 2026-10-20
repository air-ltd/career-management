/**
 * Backup and restore, end to end.
 *
 * The envelope tests prove that a *given* document round-trips through the file
 * format. This proves the thing a user actually relies on: that what is in the
 * browser right now comes back out unchanged, and that a document read out of
 * storage survives storage, a file and storage again.
 *
 * It uses the app's own `writeSnapshot` and `readSnapshot` rather than poking
 * tables directly, because those are the two functions a restore actually goes
 * through — testing around them would leave the interesting path untested.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSnapshot, writeSnapshot } from './db'
import { parseEnvelope, serialiseEnvelope, toEnvelope } from '../export/envelope'
import { readSettings, writeSettings } from '../features/shared/data'
import { clearSyncMetaForTests } from './syncMeta'
import type { Mergeable, Snapshot } from '../domain/types'

/** A record as storage holds it: typed by id and timestamps, loose elsewhere. */
type Row = Mergeable & Record<string, unknown>

/**
 * A record as storage holds it.
 *
 * The tables in a `Snapshot` are typed by id and timestamps only, so the fields a
 * particular record type has — a job's company, a question's category — are not
 * visible at this boundary. They are what they are in practice, and this says so
 * in one place rather than casting at each call site.
 */
function row(fields: Row): Row {
  return fields
}

const AT = (seconds: number) => new Date(seconds * 1000).toISOString()

/**
 * A document with something in every table.
 *
 * Written out longhand rather than built through the repositories, so that a change
 * to a repository cannot quietly change what this is asserting.
 */
function fullDocument(): Snapshot {
  return {
    schemaVersion: 1,
    entities: {
      settings: [
        row({
          id: 'settings',
          updatedAt: AT(1),
          deletedAt: null,
          preset: 'cv',
          pageSize: 'A4',
          fontPt: 10,
          singlePage: true,
          profileId: 'p1',
        }),
      ],
      profiles: [
        row({
          id: 'p1',
          updatedAt: AT(2),
          deletedAt: null,
          name: 'Domestic',
          title: 'Senior Engineer',
          email: 'me@example.com',
          phone: '+44 7000 000000',
          address: '1 Example Street',
        }),
      ],
      jobs: [
        row({
          id: 'j1',
          updatedAt: AT(3),
          deletedAt: null,
          company: 'Acme',
          jobTitle: 'Engineer',
          startDate: '2020-01-01',
          endDate: '2024-03-31',
          responsibilities: 'Did things',
          story: 'It was a good role',
        }),
        // A tombstone, because a backup that quietly drops deletions is the one
        // thing a backup must never do.
        {
          id: 'j2',
          updatedAt: AT(4),
          deletedAt: AT(5),
          company: 'Globex',
          jobTitle: 'Lead',
          startDate: '2015-01-01',
          endDate: null,
          responsibilities: '',
          story: '',
        },
      ],
      achievements: [
        row({
          id: 'a1',
          updatedAt: AT(6),
          deletedAt: null,
          jobId: 'j1',
          achievement: 'Shipped the thing',
          story: 'It took a year',
        }),
      ],
      awards: [
        row({
          id: 'w1',
          updatedAt: AT(7),
          deletedAt: null,
          year: 2016,
          institution: 'A University',
          what: 'BEng',
          story: '',
        }),
      ],
      education: [
        row({
          id: 'e1',
          updatedAt: AT(8),
          deletedAt: null,
          year: 2015,
          institution: 'A University',
          what: 'BEng',
          story: '',
        }),
      ],
      questionCategories: [
        row({ id: 'c1', updatedAt: AT(9), deletedAt: null, title: 'Behavioural', story: '' }),
      ],
      questions: [
        row({
          id: 'q1',
          updatedAt: AT(10),
          deletedAt: null,
          categoryId: 'c1',
          question: 'Tell me about yourself',
          answer: 'A prepared answer',
        }),
      ],
      templates: [],
      phrases: [],
    },
  }
}

beforeEach(async () => {
  await clearSyncMetaForTests()
})

afterEach(async () => {
  await clearSyncMetaForTests()
})

describe('backup and restore', () => {
  it('reads back exactly what was written, table by table', async () => {
    const document = fullDocument()
    await writeSnapshot(document)

    const readBack = await readSnapshot(1)
    expect(readBack.schemaVersion).toBe(1)
    for (const table of Object.keys(document.entities) as (keyof Snapshot['entities'])[]) {
      expect(readBack.entities[table]).toEqual(document.entities[table])
    }
  })

  it('restores a document from a file unchanged', () => {
    const original = fullDocument()

    // Out: the file the user exports.
    const file = serialiseEnvelope(toEnvelope(original, new Date(0)))

    // In: what a restore reads it back as.
    const parsed = parseEnvelope(JSON.parse(file), 1)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.snapshot.entities).toEqual(original.entities)
  })

  it('survives storage, a file, and storage again', async () => {
    const original = fullDocument()
    await writeSnapshot(original)

    // Export what is actually stored, rather than what was handed in — this is the
    // path that would notice a table being dropped between the two.
    const stored = await readSnapshot(1)
    const file = serialiseEnvelope(toEnvelope(stored, new Date(0)))

    await writeSnapshot({ schemaVersion: 1, entities: emptyEntities() })

    const parsed = parseEnvelope(JSON.parse(file), 1)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    await writeSnapshot(parsed.snapshot)
    const restored = await readSnapshot(1)

    for (const table of Object.keys(original.entities) as (keyof Snapshot['entities'])[]) {
      expect(restored.entities[table]).toEqual(original.entities[table])
    }
  })

  it('keeps a tombstone through the trip', async () => {
    const original = fullDocument()
    await writeSnapshot(original)

    const stored = await readSnapshot(1)
    const parsed = parseEnvelope(
      JSON.parse(serialiseEnvelope(toEnvelope(stored, new Date(0)))),
      1,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const gone = parsed.snapshot.entities.jobs.find((row) => row.id === 'j2')
    expect(gone?.deletedAt).toBe(AT(5))
  })

  it('restores the settings the document was written with', async () => {
    await writeSettings(
      {
        id: 'settings',
        updatedAt: AT(1),
        deletedAt: null,
        activeProfileId: 'p1',
        pageSize: 'Letter',
        fontSizePt: 11,
        density: 'compact',
        targetPages: 1,
      },
      new Date(0),
    )

    const readBack = await readSettings()
    expect(readBack.activeProfileId).toBe('p1')
    expect(readBack.pageSize).toBe('Letter')
    expect(readBack.density).toBe('compact')
  })

  it('counts every table, including the empty ones', () => {
    const document = fullDocument()
    const sparse: Snapshot = {
      ...document,
      entities: { ...document.entities, awards: [], education: [] },
    }
    const body = JSON.parse(serialiseEnvelope(toEnvelope(sparse, new Date(0)))) as {
      counts: Record<string, number>
    }

    for (const table of Object.keys(sparse.entities) as (keyof Snapshot['entities'])[]) {
      expect(body.counts[table]).toBe(sparse.entities[table].length)
    }
  })
})

/** An otherwise-valid document with nothing in it. */
function emptyEntities(): Snapshot['entities'] {
  return {
    settings: [],
    profiles: [],
    jobs: [],
    achievements: [],
    awards: [],
    education: [],
    questionCategories: [],
    questions: [],
    templates: [],
    phrases: [],
  }
}
