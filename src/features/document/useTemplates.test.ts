/**
 * The templates: the store, and what a template is allowed to change.
 *
 * The rules that matter are about the document's own safety: a template is a
 * choice of settings and not of records, and a built-in is not the user's to
 * change.
 */

import { describe, expect, it } from 'vitest'
import { db } from '../../storage/db'
import {
  deleteTemplate,
  ensureBuiltInTemplate,
  listTemplates,
  matchesTemplate,
  restoreTemplate,
  saveTemplate,
} from './useTemplates'
import { builtInTemplate, BUILT_IN_TEMPLATE_ID } from '../../domain/templates'
import { defaultSettings } from '../../export/envelope'
import type { Settings } from '../../domain/types'

const NOW = new Date('2026-10-01T00:00:00.000Z')

describe('the built-in template', () => {
  it('is written once, and written once only', async () => {
    await ensureBuiltInTemplate(NOW)
    await ensureBuiltInTemplate(NOW)
    const rows = await db.templates.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(BUILT_IN_TEMPLATE_ID)
  })

  it('is the document the app has always produced', async () => {
    await ensureBuiltInTemplate(NOW)
    const [template] = await listTemplates()
    const defaults = defaultSettings(NOW)
    expect(template?.pageSize).toBe(defaults.pageSize)
    expect(template?.fontSizePt).toBe(defaults.fontSizePt)
    expect(template?.density).toBe(defaults.density)
  })
})

describe('listing the templates', () => {
  it('leaves out the ones that have been deleted', async () => {
    await db.templates.put(builtInTemplate(NOW))
    await db.templates.put({
      ...builtInTemplate(NOW),
      id: 'gone',
      name: 'Gone',
      builtIn: false,
      deletedAt: NOW.toISOString(),
    })
    const names = (await listTemplates()).map((template) => template.name)
    expect(names).toEqual(['Career Management Document'])
  })

  it('is in alphabetical order, so the list does not jump about', async () => {
    await db.templates.put({ ...builtInTemplate(NOW), id: 'b', name: 'Beta' })
    await db.templates.put({ ...builtInTemplate(NOW), id: 'a', name: 'Alpha' })
    await db.templates.put({
      ...builtInTemplate(NOW),
      id: 'c',
      name: 'Career Management Document',
    })
    expect((await listTemplates()).map((template) => template.name)).toEqual([
      'Alpha',
      'Beta',
      'Career Management Document',
    ])
  })
})

describe('writing and deleting a template', () => {
  it('writes one, and stamps it', async () => {
    const template = { ...builtInTemplate(NOW), id: 'mine', name: 'Mine', builtIn: false }
    await saveTemplate(template, NOW)
    const stored = await db.templates.get('mine')
    expect(stored?.name).toBe('Mine')
    expect(stored?.updatedAt).toBe(NOW.toISOString())
  })

  it('leaves a tombstone rather than removing the row', async () => {
    await db.templates.put({ ...builtInTemplate(NOW), id: 'mine', name: 'Mine' })
    await deleteTemplate('mine', NOW)
    const stored = await db.templates.get('mine')
    expect(stored).toBeDefined()
    expect(stored?.deletedAt).toBe(NOW.toISOString())
  })

  it('does nothing for a template that is not there', async () => {
    await deleteTemplate('missing', NOW)
    expect(await db.templates.count()).toBe(0)
  })

  it('brings a deleted template back', async () => {
    await db.templates.put({
      ...builtInTemplate(NOW),
      id: 'mine',
      name: 'Mine',
      deletedAt: NOW.toISOString(),
    })
    await restoreTemplate('mine', NOW)
    expect((await db.templates.get('mine'))?.deletedAt).toBeNull()
  })
})

describe('what a template matches', () => {
  const settings = (overrides: Partial<Settings> = {}): Settings => ({
    ...defaultSettings(NOW),
    ...overrides,
  })

  it('matches a document that has not been changed', () => {
    expect(matchesTemplate(builtInTemplate(NOW), settings())).toBe(true)
  })

  it('does not match a document with a different setting', () => {
    expect(matchesTemplate(builtInTemplate(NOW), settings({ fontSizePt: 12 }))).toBe(false)
    expect(matchesTemplate(builtInTemplate(NOW), settings({ pageSize: 'Letter' }))).toBe(false)
    expect(matchesTemplate(builtInTemplate(NOW), settings({ density: 'compact' }))).toBe(false)
    expect(matchesTemplate(builtInTemplate(NOW), settings({ format: 'expanded' }))).toBe(false)
    expect(matchesTemplate(builtInTemplate(NOW), settings({ targetPages: 2 }))).toBe(false)
  })

  it('does not match a document whose sections are in a different order', () => {
    const document = settings({
      sectionOrder: ['awardsEducation', 'workHistory', 'questions'],
    })
    expect(matchesTemplate(builtInTemplate(NOW), document)).toBe(false)
  })

  it('does not match a document that has dropped a section', () => {
    expect(matchesTemplate(builtInTemplate(NOW), settings({ sections: ['workHistory'] }))).toBe(
      false,
    )
  })

  it('does not match a document that has renamed a section', () => {
    const document = settings({ sectionHeadings: { workHistory: 'Experience' } })
    expect(matchesTemplate(builtInTemplate(NOW), document)).toBe(false)
  })

  it('matches a document whose sections are in the same order', () => {
    const document = settings({
      sectionOrder: ['workHistory', 'awardsEducation', 'questions'],
      sections: ['workHistory', 'awardsEducation', 'questions'],
      sectionHeadings: {
        workHistory: '',
        awardsEducation: 'Awards and Education',
        questions: 'Interview questions',
      },
    })
    expect(matchesTemplate(builtInTemplate(NOW), document)).toBe(true)
  })
})
