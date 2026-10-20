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
import {
  achievementRow,
  awardRow,
  educationRow,
  jobRow,
  profileRow,
} from '../../test/factories'
import type { Mergeable } from '../../domain/types'

const OPTIONS: ExportOptions = PRESETS['cv'].options

function model(overrides: Partial<Parameters<typeof buildDocumentModel>[0]> = {}) {
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
  })
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
