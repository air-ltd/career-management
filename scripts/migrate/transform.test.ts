import { describe, expect, it } from 'vitest'
import {
  narrowTables as narrowTablesModule,
  parseEnvelope as parseEnvelopeModule,
} from '../../src/export/envelope'
import {
  classifyAwardEducation,
  decodeEntities,
  legacyEndDate,
  migrate,
  parseLegacyDate,
  parseTimestamp,
  parseYear,
  recordUpdatedAt,
  type LegacyRow,
  type LegacyTables,
} from './transform'

const NOW = new Date('2026-10-01T00:00:00.000Z')

const tables = (over: Partial<LegacyTables> = {}): LegacyTables => ({
  header: [],
  jobs: [],
  achievements: [],
  awards_edu: [],
  ...over,
})

const job = (over: LegacyRow = {}): LegacyRow => ({
  job_id: 1,
  creation_date: '20180408T194100',
  last_update_date: '2026-09-12 11:02:19',
  start_date: '20200101',
  end_date: '20240131',
  company: 'Acme',
  job_title: 'Engineer',
  responsibilities: 'Built things.',
  job_story: 'A story.',
  obsolete: 0,
  questions: 0,
  ...over,
})

describe('decodeEntities (MIG6)', () => {
  it('decodes the entities the legacy renderer escaped', () => {
    expect(decodeEntities('Jared &amp; Church')).toBe('Jared & Church')
    expect(decodeEntities('Tom&#039;s &quot;big&quot; win')).toBe('Tom\'s "big" win')
    expect(decodeEntities('50&#37; &gt; 40%')).toBe('50% > 40%')
  })

  it('decodes &amp; last, so an escaped entity is not manufactured into markup', () => {
    // The legacy app re-escaped on every save, so `&amp;lt;` is text the user
    // typed. Decoding &amp; first would produce a `<` that was never there.
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
  })

  it('decodes exactly once', () => {
    expect(decodeEntities('&amp;amp;')).toBe('&amp;')
  })

  it('leaves plain text alone', () => {
    expect(decodeEntities('nothing to do here')).toBe('nothing to do here')
  })
})

describe('parseLegacyDate (L5)', () => {
  it('converts YYYYMMDD', () => {
    expect(parseLegacyDate('20240131')).toBe('2024-01-31')
  })

  it('rejects a date that is not on the calendar', () => {
    expect(parseLegacyDate('20240231')).toBeNull()
    expect(parseLegacyDate('20241301')).toBeNull()
  })

  it('rejects anything that is not eight digits', () => {
    expect(parseLegacyDate('2024-01-31')).toBeNull()
    expect(parseLegacyDate('None')).toBeNull()
    expect(parseLegacyDate(null)).toBeNull()
    expect(parseLegacyDate(20240131)).toBeNull()
  })
})

describe('legacyEndDate (L3)', () => {
  it('treats both empty string and null as a current role', () => {
    expect(legacyEndDate('')).toBeNull()
    expect(legacyEndDate('   ')).toBeNull()
    expect(legacyEndDate(null)).toBeNull()
    expect(legacyEndDate(undefined)).toBeNull()
  })

  it('converts a real end date', () => {
    expect(legacyEndDate('20240131')).toBe('2024-01-31')
  })

  it('returns null for an unreadable end date rather than throwing', () => {
    expect(legacyEndDate('later')).toBeNull()
  })
})

describe('parseYear', () => {
  it('accepts a four-digit year', () => {
    expect(parseYear('2024')).toBe(2024)
    expect(parseYear(2024)).toBe(2024)
  })

  it('rejects the literal string the legacy form wrote for a blank', () => {
    expect(parseYear('None')).toBeNull()
    expect(parseYear(null)).toBeNull()
    expect(parseYear('20')).toBeNull()
  })

  it('rejects years outside the schema range', () => {
    expect(parseYear('1800')).toBeNull()
    expect(parseYear('2300')).toBeNull()
  })
})

describe('parseTimestamp', () => {
  it('reads a SQLite current_timestamp as UTC', () => {
    expect(parseTimestamp('2026-09-12 11:02:19')).toBe('2026-09-12T11:02:19.000Z')
  })

  it('reads the compact form the legacy forms wrote', () => {
    expect(parseTimestamp('20180408T194100')).toBe('2018-04-08T19:41:00.000Z')
  })

  it('refuses the garbage a legacy migration bug left behind', () => {
    expect(parseTimestamp('0m0p3uiq436gb3ipiqs3jpq0n2')).toBeNull()
  })
})

describe('recordUpdatedAt', () => {
  it('prefers last_update_date over creation_date', () => {
    const { value } = recordUpdatedAt(
      { last_update_date: '2026-09-12 11:02:19', creation_date: '20180408T194100' },
      NOW.toISOString(),
    )
    expect(value).toBe('2026-09-12T11:02:19.000Z')
  })

  it('falls back to creation_date, and reports that it is not the edit date', () => {
    const result = recordUpdatedAt(
      { last_update_date: 'rubbish', creation_date: '20180408T194100' },
      NOW.toISOString(),
    )
    expect(result).toEqual({ value: '2018-04-08T19:41:00.000Z', exact: false })
  })

  it('is exact only when last_update_date itself was readable', () => {
    expect(
      recordUpdatedAt({ last_update_date: '2026-09-12 11:02:19' }, NOW.toISOString()).exact,
    ).toBe(true)
  })

  it('falls back to the migration clock as a last resort', () => {
    const result = recordUpdatedAt({}, NOW.toISOString())
    expect(result).toEqual({ value: NOW.toISOString(), exact: false })
  })
})

describe('classifyAwardEducation (L13)', () => {
  it('trusts an explicit type', () => {
    expect(classifyAwardEducation('award', 'anything', 'anywhere').guessed).toBe(false)
    expect(classifyAwardEducation('education', 'anything', 'anywhere').guessed).toBe(false)
  })

  it('resolves a missing type from the text, and says it guessed', () => {
    const result = classifyAwardEducation(null, 'Bachelor of Engineering', 'A University')
    expect(result).toEqual({ kind: 'education', guessed: true })
  })

  it('defaults to award when the text is not decisive, and says it guessed', () => {
    const result = classifyAwardEducation(null, 'Some prize', 'A Body')
    expect(result).toEqual({ kind: 'award', guessed: true })
  })
})

describe('migrate', () => {
  it('produces an envelope the app can read', () => {
    const { envelope } = migrate(tables({ jobs: [job()] }), NOW)
    expect(envelope.format).toBe('career-management-document')
    expect(envelope.counts['jobs']).toBe(1)
    expect(envelope.data.jobs[0]).toMatchObject({
      id: '1',
      company: 'Acme',
      jobTitle: 'Engineer',
      startDate: '2020-01-01',
      endDate: '2024-01-31',
    })
  })

  it('keeps the integer id as a string (MIG5)', () => {
    const { envelope } = migrate(tables({ jobs: [job({ job_id: 42 })] }), NOW)
    expect(envelope.data.jobs[0]?.id).toBe('42')
  })

  it('files a questions = 1 job as a question category (D19)', () => {
    const { envelope } = migrate(
      tables({
        jobs: [
          job({
            job_id: 10,
            questions: 1,
            company: 'Behavioural',
            job_title: 'Questions',
            job_story: 'What I get asked.',
          }),
        ],
      }),
      NOW,
    )
    expect(envelope.counts['jobs']).toBe(0)
    expect(envelope.counts['questionCategories']).toBe(1)
    expect(envelope.data.questionCategories[0]).toMatchObject({
      id: '10',
      title: 'Behavioural',
      story: 'What I get asked.',
    })
  })

  it('files an achievement under a question category as a question (D20)', () => {
    const { envelope } = migrate(
      tables({
        jobs: [job({ job_id: 10, questions: 1, company: 'Behavioural' })],
        achievements: [
          {
            achievement_id: 5,
            job_id: 10,
            achievement: 'Why here?',
            story: 'Because.',
            last_update_date: '2026-09-12 11:04:05',
            obsolete: 0,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.counts['achievements']).toBe(0)
    expect(envelope.data.questions[0]).toMatchObject({
      categoryId: '10',
      question: 'Why here?',
      answer: 'Because.',
    })
  })

  it('leaves an achievement under a normal job alone', () => {
    const { envelope } = migrate(
      tables({
        jobs: [job()],
        achievements: [
          {
            achievement_id: 5,
            job_id: 1,
            achievement: 'Shipped it',
            story: '',
            last_update_date: '2026-09-12 11:04:05',
            obsolete: 0,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.data.achievements[0]).toMatchObject({
      jobId: '1',
      achievement: 'Shipped it',
    })
  })

  it('marks obsolete records with the migration clock (no honest timestamp exists)', () => {
    const { envelope } = migrate(tables({ jobs: [job({ obsolete: 1 })] }), NOW)
    expect(envelope.data.jobs[0]?.deletedAt).toBe(NOW.toISOString())
  })

  it('treats obsolete NULL as live', () => {
    const { envelope } = migrate(tables({ jobs: [job({ obsolete: null })] }), NOW)
    expect(envelope.data.jobs[0]?.deletedAt).toBeNull()
  })

  it('attaches an achievement with no job to the highest-numbered job, and reports it', () => {
    const { envelope, report } = migrate(
      tables({
        jobs: [
          job({ job_id: 3 }),
          job({ job_id: 77 }),
          job({ job_id: 5, questions: 1, company: 'Q' }),
        ],
        achievements: [
          {
            achievement_id: 9,
            job_id: null,
            achievement: 'Orphan',
            story: '',
            last_update_date: '2026-09-12 11:04:05',
            obsolete: 0,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.data.achievements[0]?.jobId).toBe('77')
    expect(report.notes.join(' ')).toContain('job 77')
  })

  it('reports a job whose start date it cannot read, rather than guessing', () => {
    const { envelope, report } = migrate(
      tables({ jobs: [job({ start_date: 'sometime' })] }),
      NOW,
    )
    expect(envelope.counts['jobs']).toBe(0)
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]?.field).toBe('start_date')
  })

  it('skips and reports an awards row whose year is the literal string None', () => {
    const { envelope, report } = migrate(
      tables({
        awards_edu: [
          {
            award_edu_id: 8,
            date: 'None',
            institution: 'None',
            what: 'None',
            story: 'None',
            last_update_date: '2026-09-12 11:04:53',
            obsolete: 1,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.counts['awards']).toBe(0)
    expect(report.skipped[0]?.field).toBe('date')
  })

  it('files a guessed awards type as a substitution, not a silent default', () => {
    const { report, envelope } = migrate(
      tables({
        awards_edu: [
          {
            award_edu_id: 1,
            type: null,
            date: '1999',
            institution: 'A University',
            what: 'Bachelor of Engineering',
            story: '',
            last_update_date: '2026-09-12 11:04:53',
            obsolete: 0,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.counts['education']).toBe(1)
    expect(envelope.counts['awards']).toBe(0)
    expect(report.substituted.some((p) => p.field === 'type')).toBe(true)
  })

  it('splits awards and education into two entities (D16)', () => {
    const { envelope } = migrate(
      tables({
        awards_edu: [
          {
            award_edu_id: 1,
            type: 'award',
            date: '2007',
            institution: 'A',
            what: 'B',
            story: '',
            last_update_date: '2026-01-01 00:00:00',
            obsolete: 0,
          },
          {
            award_edu_id: 2,
            type: 'education',
            date: '2017',
            institution: 'C',
            what: 'D',
            story: '',
            last_update_date: '2026-01-01 00:00:00',
            obsolete: 0,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.counts['awards']).toBe(1)
    expect(envelope.counts['education']).toBe(1)
  })

  it('turns both header rows into profiles and preselects the domestic one', () => {
    const { envelope } = migrate(
      tables({
        header: [
          {
            header_id: 1,
            name: 'international',
            title: 'T',
            email: 'e',
            phone: 'p',
            address: 'a',
            last_update_date: '20180408T194100',
            obsolete: 0,
          },
          {
            header_id: 2,
            name: 'domestic',
            title: 'T',
            email: 'e',
            phone: 'p',
            address: 'a',
            last_update_date: '20180408T194100',
            obsolete: 0,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.counts['profiles']).toBe(2)
    const settings = envelope.data.settings[0]
    expect(settings?.['activeProfileId']).toBe('2')
  })

  it('preselects nothing when there is no domestic profile, and says so', () => {
    const { envelope, report } = migrate(
      tables({
        header: [
          {
            header_id: 1,
            name: 'international',
            title: 'T',
            last_update_date: '20180408T194100',
            obsolete: 0,
          },
        ],
      }),
      NOW,
    )
    expect(envelope.data.settings[0]?.['activeProfileId']).toBeNull()
    expect(report.notes.join(' ')).toContain('No header row named "domestic"')
  })

  it('is deterministic: the same input and clock produce the same output', () => {
    const input = tables({ jobs: [job()], achievements: [] })
    expect(migrate(input, NOW).envelope).toEqual(migrate(input, NOW).envelope)
  })

  it('does not modify the rows it is given', () => {
    const row = job()
    const before = JSON.stringify(row)
    migrate(tables({ jobs: [row] }), NOW)
    expect(JSON.stringify(row)).toBe(before)
  })
})

describe("the result passes the app's own validation (MIG8)", () => {
  const parseEnvelope = parseEnvelopeModule

  it('is accepted by the same gate the sync path runs', () => {
    const { envelope } = migrate(
      tables({
        jobs: [job()],
        header: [{ header_id: 1, name: 'domestic', last_update_date: '20180408T194100' }],
      }),
      NOW,
    )
    const parsed = parseEnvelope(envelope, 1)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.snapshot.entities['jobs']).toHaveLength(1)
    }
  })

  /*
   * A hand edit that breaks a record is dropped by the second gate, not the first.
   *
   * Deliberately not a `parseEnvelope` assertion: the envelope gate checks shape
   * only, by design (D6 — a `looseObject` cannot validate fields it does not know
   * about, and refusing to carry unknown fields is what stops an older build
   * losing a newer one's data). The field-level check is `narrowTables`, which is
   * what the app actually runs before writing anything.
   */
  it('drops a hand edit that breaks a date, and reports which record', () => {
    const narrowTables = narrowTablesModule
    const { envelope } = migrate(tables({ jobs: [job()] }), NOW)
    const tampered = structuredClone(envelope)
    tampered['data']['jobs']![0]!['startDate'] = '31/01/2024'
    const parsed = parseEnvelope(tampered, 1)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const narrowed = narrowTables(parsed.snapshot)
    expect(narrowed.entities['jobs']).toHaveLength(0)
    expect(narrowed.rejected[0]).toMatchObject({
      table: 'jobs',
      id: '1',
    })
  })
})
