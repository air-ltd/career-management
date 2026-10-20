/**
 * The plain-text exporter.
 *
 * The oldest format there is, and the one that goes into everything: an email, a
 * form on a government site, a job application box that will take nothing else.
 *
 * The same `DocumentModel` as every other format, so a CV is a CV in any of them
 * (D49). Plain text has no headings and no tables, so the structure is carried by
 * blank lines and by the section names, which is what a reader of plain text has
 * always had.
 */

import type { DocumentModel, DocumentSection } from '../model'
import type { DocumentExporter } from './types'
import { formatDateRange, formatYear } from '../../domain/format'

/** The document, as plain text. */
export function toPlainText(model: DocumentModel): string {
  const lines: string[] = []
  const profile = model.profile

  if (profile !== null) {
    const title = profile.title === '' ? profile.name : profile.title
    if (title !== '') lines.push(title.toUpperCase())
    const contact = [profile.email, profile.phone, profile.address.split('\n').join(', ')]
      .filter((line) => line !== '')
      .join('  ·  ')
    if (contact !== '') lines.push(contact)
    lines.push('')
  }

  for (const section of model.sections) {
    const body = sectionBody(model, section)
    if (body === null) continue
    if (section.heading !== '') {
      lines.push(section.heading.toUpperCase())
      lines.push('')
    }
    lines.push(...body)
    lines.push('')
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}

function sectionBody(model: DocumentModel, section: DocumentSection): string[] | null {
  switch (section.key) {
    case 'workHistory':
      return workHistory(model)
    case 'awardsEducation':
      return awardsEducation(model)
    case 'questions':
      return questions(model)
    default:
      return null
  }
}

function workHistory(model: DocumentModel): string[] | null {
  if (model.jobs.length === 0) return null
  const lines: string[] = []
  for (const job of model.jobs) {
    const dates = formatDateRange(job.startDate, job.endDate)
    const heading = job.jobTitle === '' ? job.company : `${job.company}: ${job.jobTitle}`
    lines.push(`${dates}  ${heading}`)
    lines.push('')
    // A role that prints as a line has no detail to print (D63).
    if (job.hideDetail === true) continue
    for (const block of paragraphs(job.responsibilities)) {
      lines.push(block)
      lines.push('')
    }
    for (const block of paragraphs(job.story)) {
      lines.push(block)
      lines.push('')
    }
    for (const achievement of model.achievementsByJob.get(job.id) ?? []) {
      lines.push(`- ${achievement.achievement}`)
    }
    if ((model.achievementsByJob.get(job.id) ?? []).length > 0) lines.push('')
  }
  return lines
}

function awardsEducation(model: DocumentModel): string[] | null {
  if (model.awardsEducation.length === 0) return null
  const lines: string[] = []
  for (const entry of model.awardsEducation) {
    lines.push(`${formatYear(entry.year)}  ${entry.institution}  ${entry.what}`)
  }
  return lines
}

function questions(model: DocumentModel): string[] | null {
  if (model.questionCategories.length === 0) return null
  const lines: string[] = []
  for (const group of model.questionCategories) {
    lines.push(group.category.title)
    lines.push('')
    for (const question of group.questions) {
      lines.push(question.question)
      for (const block of paragraphs(question.answer)) {
        lines.push(block)
        lines.push('')
      }
      lines.push('')
    }
  }
  return lines
}

/** Blank-line separated blocks, as the document renders them. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
}

export const plainTextExporter: DocumentExporter = {
  id: 'text',
  label: 'Plain text',
  description: 'A .txt file — for an email or a form that takes nothing else.',
  mediaType: 'text/plain;charset=utf-8',
  fileExtension: 'txt',
  build(model: DocumentModel): Promise<Blob> {
    return Promise.resolve(new Blob([toPlainText(model)], { type: 'text/plain;charset=utf-8' }))
  },
}
