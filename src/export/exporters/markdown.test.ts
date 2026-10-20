/**
 * The Markdown and plain-text exporters.
 *
 * The property that matters is that they are the same document as the printed
 * one: the same sections, in the same order, with the same content. A format
 * that quietly drops a section is worse than no format, because it looks right.
 */

import { describe, expect, it } from 'vitest'
import { toMarkdown, markdownExporter } from './markdown'
import { toPlainText, plainTextExporter } from './plainText'
import { buildDocumentModel, PRESETS, type ExportOptions } from '../model'
import { defaultSettings } from '../envelope'
import type { Question, QuestionCategory } from '../../domain/types'
import {
  achievementRow,
  awardRow,
  educationRow,
  jobRow,
  profileRow,
  questionCategoryRow,
  questionRow,
} from '../../test/factories'

const OPTIONS: ExportOptions = PRESETS['cv'].options

/**
 * Build a model from a loose input.
 *
 * The cast is once, here, for the same reason the Word exporter's test does it:
 * the factories return full valid records, so the compiler has nothing to add.
 */
type LooseInput = { [K in keyof Parameters<typeof buildDocumentModel>[0]]: unknown }

function model(overrides: Partial<LooseInput> = {}) {
  return buildDocumentModel({
    options: OPTIONS,
    settings: defaultSettings(new Date(0)),
    profiles: [profileRow('p1', { name: 'Ada', title: 'Engineer', email: 'ada@example.com' })],
    jobs: [
      jobRow('j1', {
        company: 'Acme',
        jobTitle: 'Engineer',
        startDate: '2020-01-01',
        endDate: '2024-03-31',
        responsibilities: 'Ran the thing.',
      }),
    ],
    achievements: [achievementRow('a1', { jobId: 'j1', achievement: 'Shipped it' })],
    awards: [awardRow('aw1', { year: 2020, institution: 'Body', what: 'Prize' })],
    education: [educationRow('e1', { year: 2016, institution: 'Uni', what: 'Degree' })],
    questionCategories: [],
    questions: [],
    ...overrides,
  } as Parameters<typeof buildDocumentModel>[0])
}

describe('the Markdown exporter', () => {
  it('puts the name and the contact details at the top', () => {
    const markdown = toMarkdown(model())
    expect(markdown.startsWith('# Engineer')).toBe(true)
    expect(markdown).toContain('ada@example.com')
  })

  it('carries the sections, the roles and the achievements', () => {
    const markdown = toMarkdown(model())
    expect(markdown).toContain('Acme: Engineer')
    expect(markdown).toContain('Ran the thing.')
    expect(markdown).toContain('- Shipped it')
    expect(markdown).toContain('Body')
  })

  it('escapes text that would otherwise be read as markup', () => {
    const markdown = toMarkdown(
      model({
        jobs: [
          jobRow('j1', {
            company: 'Acme',
            jobTitle: 'Engineer',
            startDate: '2020-01-01',
            responsibilities: '# not a heading',
          }),
        ],
        achievements: [],
      }),
    )
    expect(markdown).toContain('\\# not a heading')
    expect(markdown).not.toMatch(/^# not a heading$/m)
  })

  it('leaves out a role that prints as a line', () => {
    const markdown = toMarkdown(
      model({
        jobs: [
          jobRow('j1', {
            company: 'Acme',
            jobTitle: 'Engineer',
            startDate: '2020-01-01',
            responsibilities: 'Hidden detail.',
            hideDetail: true,
          }),
        ],
        achievements: [],
      }),
    )
    expect(markdown).toContain('Acme: Engineer')
    expect(markdown).not.toContain('Hidden detail.')
  })

  it('builds a blob of the right kind', async () => {
    const blob = await markdownExporter.build(model())
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    expect(await blob.text()).toContain('# Engineer')
  })
})

describe('the plain-text exporter', () => {
  it('carries the same document as the Markdown one', () => {
    const text = toPlainText(model())
    expect(text).toContain('ENGINEER')
    expect(text).toContain('Acme: Engineer')
    expect(text).toContain('Ran the thing.')
    expect(text).toContain('- Shipped it')
  })

  it('has no markup in it at all', () => {
    const text = toPlainText(
      model({
        jobs: [
          jobRow('j1', {
            company: 'Acme',
            jobTitle: 'Engineer',
            startDate: '2020-01-01',
            responsibilities: '# not a heading',
          }),
        ],
        achievements: [],
      }),
    )
    expect(text).toContain('# not a heading')
  })

  it('builds a blob of the right kind', async () => {
    const blob = await plainTextExporter.build(model())
    expect(blob.type).toBe('text/plain;charset=utf-8')
    expect(await blob.text()).toContain('Acme: Engineer')
  })
})

describe('what the exporters carry that the CV does not show', () => {
  it('carries the interview questions, which the CV preset leaves out', () => {
    /*
     * The interview document is a different document, not a longer CV: the
     * questions are in the model and in the export, and the preset is what says
     * the CV does not carry them.
     */
    const interview = buildDocumentModel({
      options: PRESETS['interview'].options,
      settings: defaultSettings(new Date(0)),
      profiles: [],
      jobs: [],
      achievements: [],
      awards: [],
      education: [],
      questionCategories: [
        questionCategoryRow('c1', { title: 'Behavioural' }) as unknown as QuestionCategory,
      ],
      questions: [
        questionRow('q1', {
          categoryId: 'c1',
          question: 'Why us?',
          answer: 'Because.',
        }) as unknown as Question,
      ],
    })
    const markdown = toMarkdown(interview)
    expect(markdown).toContain('Behavioural')
    expect(markdown).toContain('Why us?')
    expect(markdown).toContain('Because.')
    // The plain text uppercases the titles and leaves the prose as it is.
    expect(toPlainText(interview)).toContain('INTERVIEW QUESTIONS')
    expect(toPlainText(interview)).toContain('Why us?')
  })

  it('carries a story, which is a record the CV preset leaves out but the other one keeps', () => {
    const withStory = model({
      jobs: [
        jobRow('j1', {
          company: 'Acme',
          jobTitle: 'Engineer',
          startDate: '2020-01-01',
          endDate: '2024-03-31',
          responsibilities: 'Ran the thing.',
          story: 'And it was hard.',
        }),
      ],
      achievements: [],
    })
    const markdown = toMarkdown(withStory)
    expect(markdown).toContain('And it was hard.')
    expect(markdown).toContain('*And it was hard.*')
    expect(toPlainText(withStory)).toContain('And it was hard.')
  })

  it('carries the achievements of a role', () => {
    const markdown = toMarkdown(model())
    expect(markdown).toContain('- Shipped it')
    expect(toPlainText(model())).toContain('- Shipped it')
  })

  it('leaves out a section this build does not know how to draw', () => {
    /*
     * A document written by a later build may have a section this one has never
     * heard of. It is kept rather than dropped (D6), and the exporter leaves it
     * alone rather than guessing at it.
     */
    const fromTheFuture = model({
      settings: {
        ...defaultSettings(new Date(0)),
        sectionOrder: ['somethingNew', 'workHistory'],
        sections: ['somethingNew', 'workHistory'],
      },
    })
    const markdown = toMarkdown(fromTheFuture)
    expect(markdown).toContain('Acme: Engineer')
    expect(markdown).not.toContain('somethingNew')
  })

  it('leaves out a section the document does not have', () => {
    // The questions section, in a document with no questions: nothing to print,
    // so nothing is printed.
    const markdown = toMarkdown(model())
    expect(markdown).not.toContain('Interview questions')
  })
})

describe('the section order', () => {
  it('is the order the document has, in both formats', () => {
    /*
     * The order is what a template decides (D57), and an export that reordered
     * the sections would be a document that is not the one that was printed.
     */
    const withOrder = model({
      settings: {
        ...defaultSettings(new Date(0)),
        sectionOrder: ['awardsEducation', 'workHistory', 'questions'],
        sections: ['awardsEducation', 'workHistory'],
      },
    })
    const markdown = toMarkdown(withOrder)
    expect(markdown.indexOf('Awards and Education')).toBeLessThan(
      markdown.indexOf('Acme: Engineer'),
    )
    const text = toPlainText(withOrder)
    expect(text.indexOf('AWARDS AND EDUCATION')).toBeLessThan(text.indexOf('Acme: Engineer'))
  })
})
