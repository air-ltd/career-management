/**
 * Templates.
 *
 * The rules are about what a template is and is not allowed to be, so they are
 * checked against the settings themselves rather than against the code that
 * reads them.
 */

import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_TEMPLATE_ID,
  builtInTemplate,
  templateSettings,
  templateSummary,
} from './templates'
import { matchesTemplate } from '../features/document/useTemplates'
import { defaultSettings } from '../export/envelope'
import { DEFAULT_SECTION_HEADINGS, DEFAULT_SECTION_ORDER, DEFAULT_SECTIONS } from './sections'
import { buildDocumentModel, PRESETS } from '../export/model'
import type { Achievement, Award, Job, Profile, Settings } from './types'
import { achievementRow, awardRow, jobRow, profileRow } from '../test/factories'

const NOW = new Date('2026-10-01T00:00:00.000Z')

describe('the built-in template', () => {
  it('reproduces the document the app has always produced', () => {
    /*
     * D54: an existing user's first load must look exactly like their previous
     * load. The built-in template is therefore the default settings, exactly.
     */
    const template = builtInTemplate(NOW)
    const defaults = defaultSettings(NOW)
    expect(template.pageSize).toBe(defaults.pageSize)
    expect(template.fontSizePt).toBe(defaults.fontSizePt)
    expect(template.density).toBe(defaults.density)
    expect(template.format).toBe(defaults.format)
    expect(template.targetPages).toBe(defaults.targetPages)
    expect(template.sections).toEqual(DEFAULT_SECTIONS)
  })

  it('is built in, so it cannot be edited or deleted in place', () => {
    expect(builtInTemplate(NOW).builtIn).toBe(true)
  })

  it('has the same id every time, so two devices seed one row rather than two', () => {
    expect(builtInTemplate(NOW).id).toBe(BUILT_IN_TEMPLATE_ID)
    expect(builtInTemplate(new Date(0)).id).toBe(BUILT_IN_TEMPLATE_ID)
  })
})

describe('templateSettings', () => {
  it('carries the document settings and nothing else', () => {
    const wanted = templateSettings(builtInTemplate(NOW))
    expect(wanted).not.toHaveProperty('activeProfileId')
    expect(wanted).not.toHaveProperty('id')
  })

  it('reads a document with no section order as the default one', () => {
    const settings = defaultSettings(NOW)
    const wanted = templateSettings(settings)
    expect(wanted.sectionOrder).toEqual(DEFAULT_SECTIONS)
    expect(wanted.sections).toEqual(DEFAULT_SECTIONS)
  })
})

describe('matchesTemplate', () => {
  it('says a fresh document matches the built-in template', () => {
    expect(matchesTemplate(builtInTemplate(NOW), defaultSettings(NOW))).toBe(true)
  })

  it('says a document with a different type size does not', () => {
    const settings = { ...defaultSettings(NOW), fontSizePt: 12 }
    expect(matchesTemplate(builtInTemplate(NOW), settings)).toBe(false)
  })

  it('says a document with the sections in a different order does not', () => {
    const settings = {
      ...defaultSettings(NOW),
      sectionOrder: ['awardsEducation', 'workHistory', 'questions'],
    }
    expect(matchesTemplate(builtInTemplate(NOW), settings)).toBe(false)
  })

  it('says a document with a section dropped does not', () => {
    const settings = { ...defaultSettings(NOW), sections: ['workHistory'] }
    expect(matchesTemplate(builtInTemplate(NOW), settings)).toBe(false)
  })

  it('says a document with a renamed section does not', () => {
    const settings = {
      ...defaultSettings(NOW),
      sectionHeadings: { workHistory: 'Experience' },
    }
    expect(matchesTemplate(builtInTemplate(NOW), settings)).toBe(false)
  })
})

describe('templateSummary', () => {
  it('says what is different about a template', () => {
    /*
     * D60: "International" tells the user nothing about what they will get.
     */
    const template = {
      ...builtInTemplate(NOW),
      fontSizePt: 12,
      pageSize: 'Letter' as const,
    }
    const summary = templateSummary(template)
    expect(summary).toContain('Letter')
    expect(summary).toContain('12pt')
    expect(summary).toContain('work history')
  })

  it('says nothing about the parts that are the default', () => {
    const summary = templateSummary(builtInTemplate(NOW))
    expect(summary).not.toContain('A4')
    expect(summary).not.toContain('10pt')
  })
})

describe('the summary of a template with a section this build does not know', () => {
  it('names the section, rather than leaving a gap in the summary', () => {
    const template = {
      ...builtInTemplate(NOW),
      sectionOrder: ['somethingNew', 'workHistory'],
      sections: ['somethingNew', 'workHistory'],
    }
    expect(templateSummary(template)).toContain('somethingNew')
  })
})

describe('a document written before templates existed', () => {
  it('looks exactly as it did, and matches the built-in template', () => {
    /*
     * The gate for Phase 12: an existing user's first load must look exactly
     * like their previous load. A document written before the templates have no
     * template, no section order and no section headings, and the defaults are
     * what it was already rendering.
     */
    const settings: Settings = defaultSettings(NOW)
    expect(settings.sectionOrder).toBeUndefined()
    expect(settings.sections).toBeUndefined()
    expect(settings.sectionHeadings).toBeUndefined()

    const model = buildDocumentModel({
      options: PRESETS['cv'].options,
      settings,
      profiles: [
        profileRow('p1', { name: 'Domestic', title: 'Engineer' }) as unknown as Profile,
      ],
      jobs: [jobRow('j1', { company: 'Acme', jobTitle: 'Engineer' }) as unknown as Job],
      achievements: [
        achievementRow('a1', {
          jobId: 'j1',
          achievement: 'Shipped it',
        }) as unknown as Achievement,
      ],
      awards: [
        awardRow('aw1', { year: 2024, institution: 'Body', what: 'Prize' }) as unknown as Award,
      ],
      education: [],
      questionCategories: [],
      questions: [],
    })

    // The same sections, in the same order, with the same content.
    expect(model.sections.map((section) => section.key)).toEqual([
      'workHistory',
      'awardsEducation',
      'questions',
    ])
    expect(model.sections[0]?.heading).toBe('')
    expect(model.sections[1]?.heading).toBe('Awards and Education')
    expect(model.jobs).toHaveLength(1)
    expect(model.awardsEducation).toHaveLength(1)

    // And the built-in template is what that document is using, so the picker
    // shows it rather than "Custom".
    expect(matchesTemplate(builtInTemplate(NOW), settings)).toBe(true)
  })
})

describe('a template from an older build', () => {
  /*
   * A template carries a fixed set of fields, and a build that predates the
   * format — the layout, the section order, the headings — is missing them.
   * A missing field is not an error: it is a document from before that field
   * existed, and it gets the default for it.
   */
  it('is applied with the defaults for the fields it does not have', () => {
    const older = {
      pageSize: 'A4' as const,
      fontSizePt: 10,
      density: 'normal' as const,
      targetPages: 1,
    }

    const settings = templateSettings(older)

    expect(settings.format).toBe('compressed')
    expect(settings.sectionOrder).toEqual(DEFAULT_SECTION_ORDER)
    expect(settings.sections).toEqual(DEFAULT_SECTIONS)
    expect(settings.sectionHeadings).toEqual(DEFAULT_SECTION_HEADINGS)
  })
})

describe("a template's summary", () => {
  it('says the whitespace is additional when the format is expanded', () => {
    const summary = templateSummary({
      ...builtInTemplate(new Date(0)),
      format: 'expanded',
    })
    expect(summary).toContain('additional whitespace')
  })

  it('says nothing about the whitespace when the spacing is normal', () => {
    const summary = templateSummary({
      ...builtInTemplate(new Date(0)),
      format: 'compressed',
      density: 'normal',
    })
    expect(summary).not.toContain('whitespace')
    expect(summary).not.toContain('spacing')
  })
})
