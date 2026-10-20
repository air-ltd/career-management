/**
 * Preset and model tests.
 *
 * The behaviour under test is which records end up in which document, because
 * that is the whole distinction between a CV and interview preparation — and
 * getting it wrong produces a document the user did not mean to send.
 */

import { describe, expect, it } from 'vitest'
import { buildDocumentModel, PRESETS, type ExportOptions } from './model'
import {
  achievementRow,
  awardRow,
  educationRow,
  jobRow,
  profileRow,
  questionCategoryRow,
  questionRow,
} from '../test/factories'
import { db } from '../storage/db'
import { defaultSettings } from './envelope'

/**
 * A complete, empty input with overrides applied.
 *
 * The cast is at this boundary and nowhere else: the factories produce full valid
 * records, and the arrays are empty by default, so a caller only ever states the
 * one table it cares about. Typing each call site would be a hundred casts to
 * assert nothing the factories already guarantee.
 */
/**
 * The input shape with every table loosened to `unknown`.
 *
 * Only the values are loosened, and only here. The factories return full valid
 * records and the arrays are empty by default, so a caller states one table and
 * the compiler has nothing useful to add — but it will still check, and produce
 * a hundred identical errors to assert a guarantee the factories already give.
 */
type LooseInput = { [K in keyof Parameters<typeof buildDocumentModel>[0]]: unknown }

function rows(overrides: Partial<LooseInput> = {}): Parameters<typeof buildDocumentModel>[0] {
  return {
    options: PRESETS['cv'].options,
    settings: defaultSettings(new Date(0)),
    profiles: [],
    jobs: [],
    achievements: [],
    awards: [],
    education: [],
    questionCategories: [],
    questions: [],
    ...overrides,
  } as Parameters<typeof buildDocumentModel>[0]
}

describe('question categories', () => {
  /*
   * Alphabetical, because a category is a heading and not an event.
   *
   * The fixture deliberately stores them out of order — Technical created before
   * Behavioural — so a test that passes on creation order would pass on anything.
   */
  const categories = (titles: string[]) =>
    buildDocumentModel(
      rows({
        options: PRESETS['interview'].options,
        questionCategories: titles.map((title, index) =>
          questionCategoryRow(`c${index}`, { title }),
        ),
        questions: titles.map((_, index) =>
          questionRow(`q${index}`, { categoryId: `c${index}` }),
        ),
      }),
    )

  it('lists question categories alphabetically', () => {
    const model = categories(['Technical', 'Behavioural', 'Situational'])
    expect(model.questionCategories.map((group) => group.category.title)).toEqual([
      'Behavioural',
      'Situational',
      'Technical',
    ])
  })

  it('keeps every category that still has questions', () => {
    const model = categories(['Technical', 'Behavioural'])
    expect(model.questionCategories).toHaveLength(2)
  })
})

describe('buildDocumentModel', () => {
  it('includes jobs, achievements, awards and education in the CV', () => {
    const model = buildDocumentModel(
      rows({
        jobs: [jobRow('j1')],
        achievements: [achievementRow('a1', { jobId: 'j1' })],
        awards: [awardRow('aw1')],
        education: [educationRow('e1')],
      }),
    )

    expect(model.jobs).toHaveLength(1)
    expect(model.achievementsByJob.get('j1')).toHaveLength(1)
    expect(model.awardsEducation).toHaveLength(2)
  })

  it("prints a job's achievements in the order the user set", () => {
    /*
     * The order is the user's decision, and the document is where it is read.
     * The fixture stores them the other way round, so a test that passed on
     * creation order would pass on anything.
     */
    const model = buildDocumentModel(
      rows({
        jobs: [jobRow('j1')],
        achievements: [
          achievementRow('a1', { jobId: 'j1', order: 2 }),
          achievementRow('a2', { jobId: 'j1', order: 0 }),
          achievementRow('a3', { jobId: 'j1', order: 1 }),
        ],
      }),
    )

    expect(model.achievementsByJob.get('j1')?.map((record) => record.id)).toEqual([
      'a2',
      'a3',
      'a1',
    ])
  })

  it('keeps achievements that have no order after the ones that have one', () => {
    /*
     * Records written before the order existed have none, and a new achievement
     * goes above them — so an ordered record and an unordered one cannot be in
     * the same list without the order deciding between them.
     */
    const model = buildDocumentModel(
      rows({
        jobs: [jobRow('j1')],
        achievements: [
          achievementRow('a1', { jobId: 'j1' }),
          achievementRow('a2', { jobId: 'j1', order: 0 }),
        ],
      }),
    )

    expect(model.achievementsByJob.get('j1')?.map((record) => record.id)).toEqual(['a2', 'a1'])
  })

  it("prints a category's questions in the order the user set", () => {
    /*
     * The order is the user's decision, and the preparation document is where it
     * is read. The fixture stores them the other way round, so a test that passed
     * on creation order would pass on anything.
     */
    const model = buildDocumentModel(
      rows({
        options: PRESETS['interview'].options,
        questionCategories: [questionCategoryRow('c1')],
        questions: [
          questionRow('q1', { categoryId: 'c1', order: 2 }),
          questionRow('q2', { categoryId: 'c1', order: 0 }),
          questionRow('q3', { categoryId: 'c1', order: 1 }),
        ],
      }),
    )

    expect(model.questionCategories[0]?.questions.map((record) => record.id)).toEqual([
      'q2',
      'q3',
      'q1',
    ])
  })

  it('keeps questions that have no order after the ones that have one', () => {
    const model = buildDocumentModel(
      rows({
        options: PRESETS['interview'].options,
        questionCategories: [questionCategoryRow('c1')],
        questions: [
          questionRow('q1', { categoryId: 'c1' }),
          questionRow('q2', { categoryId: 'c1', order: 0 }),
        ],
      }),
    )

    expect(model.questionCategories[0]?.questions.map((record) => record.id)).toEqual([
      'q2',
      'q1',
    ])
  })

  it('excludes question categories from the CV by default', () => {
    const model = buildDocumentModel(
      rows({
        questionCategories: [questionCategoryRow('c1')],
        questions: [questionRow('q1', { categoryId: 'c1' })],
      }),
    )
    expect(model.questionCategories).toHaveLength(0)
  })

  it('includes question categories in interview preparation', () => {
    const model = buildDocumentModel(
      rows({
        options: PRESETS['interview'].options,
        questionCategories: [questionCategoryRow('c1')],
        questions: [questionRow('q1', { categoryId: 'c1' })],
      }),
    )
    expect(model.questionCategories).toHaveLength(1)
    expect(model.questionCategories[0]?.questions).toHaveLength(1)
  })

  it('omits a category whose questions are all deleted', () => {
    const model = buildDocumentModel(
      rows({
        options: PRESETS['interview'].options,
        questionCategories: [questionCategoryRow('c1')],
        questions: [
          questionRow('q1', { categoryId: 'c1', deletedAt: '1970-01-01T00:00:05.000Z' }),
        ],
      }),
    )
    expect(model.questionCategories).toHaveLength(0)
  })

  it('excludes deleted records unless asked', () => {
    const hidden = buildDocumentModel(
      rows({ jobs: [jobRow('j1', { deletedAt: '1970-01-01T00:00:05.000Z' })] }),
    )
    expect(hidden.jobs).toHaveLength(0)

    const shown = buildDocumentModel(
      rows({
        options: { ...PRESETS['cv'].options, includeDeleted: true },
        jobs: [jobRow('j1', { deletedAt: '1970-01-01T00:00:05.000Z' })],
      }),
    )
    expect(shown.jobs).toHaveLength(1)
  })

  it('combines awards and education into one list, newest year first (D16)', () => {
    const model = buildDocumentModel(
      rows({
        awards: [awardRow('old', { year: 2010 }), awardRow('new', { year: 2024 })],
        education: [educationRow('mid', { year: 2018 })],
      }),
    )
    expect(model.awardsEducation.map((entry) => entry.year)).toEqual([2024, 2018, 2010])
  })

  it('sorts same-year entries by institution', () => {
    const model = buildDocumentModel(
      rows({
        awards: [
          awardRow('z', { year: 2024, institution: 'Zeta' }),
          awardRow('a', { year: 2024, institution: 'Alpha' }),
        ],
      }),
    )
    expect(model.awardsEducation.map((entry) => entry.institution)).toEqual(['Alpha', 'Zeta'])
  })

  it('orders jobs by start date, newest first', () => {
    const model = buildDocumentModel(
      rows({
        jobs: [
          jobRow('old', { startDate: '2001-01-01' }),
          jobRow('new', { startDate: '2020-01-01' }),
        ],
      }),
    )
    expect(model.jobs.map((job) => job.id)).toEqual(['new', 'old'])
  })

  it('uses the selected profile and names the absence when there is none', () => {
    const withProfile = buildDocumentModel(
      rows({
        profiles: [profileRow('p1')],
        settings: { ...defaultSettings(new Date(0)), activeProfileId: 'p1' },
      }),
    )
    expect(withProfile.profile?.id).toBe('p1')

    const none = buildDocumentModel(rows())
    expect(none.profile).toBeNull()
  })

  it('ignores a profile that was deleted', () => {
    const model = buildDocumentModel(
      rows({
        profiles: [profileRow('p1', { deletedAt: '1970-01-01T00:00:05.000Z' })],
        settings: { ...defaultSettings(new Date(0)), activeProfileId: 'p1' },
      }),
    )
    expect(model.profile).toBeNull()
  })

  it('does not silently use a profile other than the selected one', () => {
    // Two profiles, one of them selected: the other must not appear.
    const model = buildDocumentModel(
      rows({
        profiles: [profileRow('p1'), profileRow('p2')],
        settings: { ...defaultSettings(new Date(0)), activeProfileId: 'p2' },
      }),
    )
    expect(model.profile?.id).toBe('p2')
  })

  it('has no profile when the selection points at one that is gone and others are ambiguous', () => {
    const model = buildDocumentModel(
      rows({
        profiles: [profileRow('p1'), profileRow('p2')],
        settings: { ...defaultSettings(new Date(0)), activeProfileId: 'missing' },
      }),
    )
    expect(model.profile).toBeNull()
  })

  it('uses the only profile when none is selected, so a first install is not blank', () => {
    // Adding your first profile and being told to go and select it is a poor
    // first run for the one action a new user takes first.
    const model = buildDocumentModel(rows({ profiles: [profileRow('p1')] }))
    expect(model.profile?.id).toBe('p1')
  })

  it('uses no profile when several exist and none is selected, rather than guessing', () => {
    // Two profiles and no selection has no defensible default.
    const model = buildDocumentModel(rows({ profiles: [profileRow('p1'), profileRow('p2')] }))
    expect(model.profile).toBeNull()
  })

  it('prefers the selected profile over the only-other one', () => {
    const model = buildDocumentModel(
      rows({
        profiles: [profileRow('p1'), profileRow('p2')],
        settings: { ...defaultSettings(new Date(0)), activeProfileId: 'p2' },
      }),
    )
    expect(model.profile?.id).toBe('p2')
  })

  it('drops achievements whose job is gone rather than showing them orphaned', () => {
    const model = buildDocumentModel(
      rows({ achievements: [achievementRow('a1', { jobId: 'gone' })] }),
    )
    expect([...model.achievementsByJob.keys()]).toEqual([])
  })

  it('handles an empty document without throwing', () => {
    const model = buildDocumentModel(rows())
    expect(model.jobs).toHaveLength(0)
    expect(model.awardsEducation).toHaveLength(0)
    expect(model.profile).toBeNull()
  })

  it('is a pure function of its inputs', () => {
    const args = rows({ jobs: [jobRow('j1')] })
    expect(buildDocumentModel(args)).toEqual(buildDocumentModel(args))
  })
})

describe('defaultSettings', () => {
  it('survives a round trip through the database and the entity schema', async () => {
    await db.settings.put(defaultSettings(new Date(0)))
    const stored = await db.settings.get('settings')
    expect(stored?.pageSize).toBe('A4')
    expect(stored?.fontSizePt).toBe(10)
    expect(stored?.targetPages).toBe(1)
    expect(stored?.activeProfileId).toBeNull()
  })
})

describe('ExportOptions', () => {
  it('is a plain object, so it can be stored and diffed', () => {
    const options: ExportOptions = PRESETS['cv'].options
    expect(JSON.parse(JSON.stringify(options))).toEqual(options)
  })
})
