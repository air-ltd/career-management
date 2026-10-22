/**
 * Templates: the named sets of document settings a user can choose between.
 *
 * A template is settings with a name (D54). Choosing one copies its settings
 * into the document; the document's own records are not part of it and are not
 * touched (D56). The preset stays a separate axis: the template decides the
 * shape, the preset decides the content (D59).
 */

import { DEFAULT_FONT_SIZE_PT, DEFAULT_PAGE_SIZE, type Settings, type Template } from './types'
import {
  DEFAULT_SECTION_HEADINGS,
  DEFAULT_SECTION_ORDER,
  DEFAULT_SECTIONS,
  type SectionKey,
} from './sections'

/**
 * The id of the built-in template.
 *
 * Fixed rather than generated, so that two devices which both seed it produce
 * one row rather than two, and so the merge resolves them by last-write-wins
 * instead of leaving a duplicate behind (D55).
 */
export const BUILT_IN_TEMPLATE_ID = 'builtin:career-management-document'

/**
 * The style that reproduces the document the app has always produced.
 *
 * Its settings are the ones the user already had, so an existing user's first
 * load looks exactly like their previous load (D54): a template is a choice
 * rather than a surprise on upgrade.
 *
 * Named for what it is rather than for the document it makes — the document is
 * the user's own, and the thing that decides how it looks is a style.
 */
export function builtInTemplate(now: Date): Template {
  return {
    id: BUILT_IN_TEMPLATE_ID,
    updatedAt: now.toISOString(),
    deletedAt: null,
    name: 'Standard',
    builtIn: true,
    pageSize: DEFAULT_PAGE_SIZE,
    fontSizePt: DEFAULT_FONT_SIZE_PT,
    density: 'normal',
    format: 'compressed',
    targetPages: 1,
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    sections: [...DEFAULT_SECTIONS],
    sectionHeadings: { ...DEFAULT_SECTION_HEADINGS },
  }
}

/**
 * The settings a template sets, and nothing else.
 *
 * The settings a document already had — which profile is selected, for one — are
 * not part of a template: they are about the document's content rather than its
 * shape, and copying them would mean choosing a template changed who the CV was
 * for (D56).
 */
export function templateSettings(template: {
  pageSize: Settings['pageSize']
  fontSizePt: number
  density: Settings['density']
  format?: Settings['format'] | undefined
  targetPages: number
  sectionOrder?: readonly string[] | undefined
  sections?: readonly string[] | undefined
  sectionHeadings?: Record<string, string> | undefined
}): Partial<Settings> {
  return {
    pageSize: template.pageSize,
    fontSizePt: template.fontSizePt,
    density: template.density,
    // Absent means compressed, which is what a document written before the
    // format existed looks like.
    format: template.format ?? 'compressed',
    targetPages: template.targetPages,
    sectionOrder: [...(template.sectionOrder ?? DEFAULT_SECTION_ORDER)],
    sections: [...(template.sections ?? DEFAULT_SECTIONS)],
    sectionHeadings: { ...(template.sectionHeadings ?? DEFAULT_SECTION_HEADINGS) },
  }
}

/**
 * One line about what a template is, for the picker (D60).
 *
 * "International" tells the user nothing about what they will get, so the
 * summary says what is different: the page size, the type size, the order of the
 * sections and the ones it adds or drops.
 */
export function templateSummary(template: Template): string {
  const size =
    template.fontSizePt === DEFAULT_FONT_SIZE_PT ? '' : `${template.fontSizePt}pt type`
  // The whitespace is one thing now, so it is described as one thing.
  const whitespace =
    template.format === 'expanded'
      ? 'additional whitespace'
      : template.density === 'normal'
        ? ''
        : `${template.density} spacing`
  const page = template.pageSize === DEFAULT_PAGE_SIZE ? '' : `${template.pageSize} page`

  const included = template.sections.filter((key) => template.sectionOrder.includes(key))
  const order = included.map((key) => sectionName(key)).join(', ')

  return [page, size, whitespace, order].filter((part) => part !== '').join(' · ')
}

/** The name of a section, for the summary and for the headings. */
function sectionName(key: string): string {
  if (key in DEFAULT_SECTION_HEADINGS) {
    return DEFAULT_SECTION_HEADINGS[key as SectionKey] === ''
      ? 'work history'
      : DEFAULT_SECTION_HEADINGS[key as SectionKey]
  }
  return key
}
