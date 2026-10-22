/**
 * The Markdown exporter.
 *
 * Markdown rather than HTML, because the point of exporting a document is to put
 * it somewhere else, and Markdown goes nearly everywhere: a repository, a
 * notebook, a wiki, a word processor that reads it.
 *
 * The same `DocumentModel` as every other format, so a CV is a CV in any of them
 * (D49). The sections come out in the order the document has them, and with the
 * headings the document has, because that is what a template decides.
 */

import type { DocumentModel, DocumentSection } from '../model'
import type { DocumentExporter } from './types'
import { formatDateRange } from '../../domain/format'

/**
 * Text that would be read as markup if it were put straight into the file.
 *
 * A line of the user's own writing that begins with a hash or a dash is not a
 * heading or a list item — it is a line of a CV that happens to start with one.
 * Escaping it keeps the exported file saying what the document says, which is
 * the whole point of an export.
 *
 * Only the start of a line is escaped. A dash in the middle of a sentence is
 * prose.
 */
function escapeLine(text: string): string {
  return text.replace(/^([#>\-*+]|\d+\.)(\s|$)/, '\\$1$2')
}

function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1')
}

/** The document, as Markdown. */
export function toMarkdown(model: DocumentModel): string {
  const lines: string[] = []
  const profile = model.profile

  if (profile !== null) {
    const title = profile.title === '' ? profile.name : profile.title
    if (title !== '') lines.push(`# ${escapeInline(title)}`)
    const contact = [profile.email, profile.phone, profile.address.split('\n').join(', ')]
      .filter((line) => line !== '')
      .join(' · ')
    if (contact !== '') lines.push(escapeInline(contact))
    lines.push('')
  }

  for (const section of model.sections) {
    const body = sectionBody(model, section)
    if (body === null) continue
    if (section.heading !== '') {
      lines.push(`## ${escapeInline(section.heading)}`)
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
    lines.push(`### ${escapeInline(dates)}  ${escapeInline(heading)}`)
    lines.push('')
    // A role that prints as a line has no detail to print (D63).
    if (job.hideDetail === true) continue
    for (const block of paragraphs(job.responsibilities)) {
      lines.push(escapeLine(block))
      lines.push('')
    }
    for (const block of paragraphs(job.story)) {
      lines.push(`*${escapeLine(block)}*`)
      lines.push('')
    }
    for (const achievement of model.achievementsByJob.get(job.id) ?? []) {
      lines.push(`- ${escapeInline(achievement.achievement)}`)
    }
    if ((model.achievementsByJob.get(job.id) ?? []).length > 0) lines.push('')
  }
  return lines
}

function awardsEducation(model: DocumentModel): string[] | null {
  if (model.awardsEducation.length === 0) return null
  const lines: string[] = []
  for (const entry of model.awardsEducation) {
    lines.push(
      `- ${escapeInline(String(entry.year))} — ${escapeInline(entry.institution)} — ${escapeInline(entry.what)}`,
    )
  }
  return lines
}

function questions(model: DocumentModel): string[] | null {
  if (model.questionCategories.length === 0) return null
  const lines: string[] = []
  for (const group of model.questionCategories) {
    lines.push(`### ${escapeInline(group.category.title)}`)
    lines.push('')
    for (const question of group.questions) {
      lines.push(`**${escapeInline(question.question)}**`)
      lines.push('')
      for (const block of paragraphs(question.answer)) {
        lines.push(escapeLine(block))
        lines.push('')
      }
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

export const markdownExporter: DocumentExporter = {
  id: 'markdown',
  label: 'Markdown',
  description: 'A .md file — for a repository, a notebook or a wiki.',
  mediaType: 'text/markdown;charset=utf-8',
  fileExtension: 'md',
  build(model: DocumentModel): Promise<Blob> {
    return Promise.resolve(
      new Blob([toMarkdown(model)], { type: 'text/markdown;charset=utf-8' }),
    )
  },
}
