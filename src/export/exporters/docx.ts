/**
 * The `.docx` exporter.
 *
 * Native Word structure rather than a copy of the screen layout (D48): real
 * heading levels, a real table for the combined awards and education entries,
 * normal paragraphs throughout. A document that looks right until the user
 * edits it, and then falls apart, is not a document.
 *
 * Every consumer receives the same `DocumentModel`, so a CV is a CV whether it
 * is printed or exported (D49).
 */

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  Tab,
  TabStopType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { DocumentModel } from '../model'
import type { DocumentExporter } from './types'
import { AWARDS_SECTION_TITLE } from '../model'
import { pageGeometry, wordPageSize } from '../page'
import { formatMonthYear } from '../../domain/format'

/**
 * Half a point size, which is how Word expresses type size.
 *
 * `fontSizePt` is the document setting (D28). The 1pt floor and 14pt ceiling are
 * the ones in `domain/types`; nothing here overrides them, so a `.docx` cannot
 * be produced at a size the print output would refuse.
 */
const HALF_POINTS_PER_PT = 2

const HEADING_SIZE = {
  title: 32,
  section: 26,
  job: 22,
} as const

/** A paragraph with blank lines between blocks, which is how stories read. */
function paragraphs(text: string, size: number, italics = false): Paragraph[] {
  const blocks = text
    .split(/\n{2,}|\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
  if (blocks.length === 0) return []
  return blocks.map(
    (block) =>
      new Paragraph({
        children: [new TextRun({ text: block, size: size * HALF_POINTS_PER_PT, italics })],
        spacing: { after: 120 },
      }),
  )
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({
    heading: level,
    children: [
      new TextRun({ text, bold: true, size: HEADING_SIZE.section * HALF_POINTS_PER_PT }),
    ],
    spacing: { before: 240, after: 120 },
    // D33: a heading must never be orphaned at the foot of a page.
    keepNext: true,
  })
}

export const docxExporter: DocumentExporter = {
  id: 'docx',
  label: 'Word document',
  description:
    'A .docx with real headings and a real table, so it can be edited and restyled in Word.',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fileExtension: '.docx',

  async build(model: DocumentModel): Promise<Blob> {
    const size = model.settings.fontSizePt * HALF_POINTS_PER_PT
    const children: (Paragraph | Table)[] = []

    const geometry = pageGeometry(model.settings.pageSize)
    const page = wordPageSize(geometry)
    // Where a right tab lands the date range: the right edge of the text column.
    const contentWidthTwips = geometry.contentWidthTwips

    // --- header ----------------------------------------------------------
    if (model.profile !== null) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [
            new TextRun({
              text: model.profile.title || model.profile.name,
              size: HEADING_SIZE.title * HALF_POINTS_PER_PT,
            }),
          ],
          keepNext: true,
        }),
      )
      const contact = [
        model.profile.email,
        model.profile.phone,
        model.profile.address.split('\n').join(', '),
      ]
        .filter((line) => line !== '')
        .join('  |  ')
      if (contact !== '') {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: contact, size })],
            spacing: { after: 240 },
          }),
        )
      }
    }

    // --- work history ----------------------------------------------------
    if (model.jobs.length > 0) {
      children.push(heading('Work history', HeadingLevel.HEADING_1))

      for (const job of model.jobs) {
        const achievements = model.achievementsByJob.get(job.id) ?? []

        // D17: displayed at month precision, which is CV convention.
        const range =
          job.endDate === null
            ? `${formatMonthYear(job.startDate)} - present`
            : `${formatMonthYear(job.startDate)} - ${formatMonthYear(job.endDate)}`

        /**
         * `<dates>  <company>: <job title>` on one line — matching the on-screen
         * document.
         *
         * A **left tab stop**, not a two-column table. D34 rules tables out for
         * positioning because applicant tracking systems parse the text stream,
         * and layout tables are the usual cause of a CV parsing badly. A tab
         * achieves the same alignment — every company name starting at the same
         * position — as ordinary inline text.
         */
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({ text: range, size, italics: true }),
              new Tab(),
              new TextRun({
                text: jobHeading(job),
                bold: true,
                size: HEADING_SIZE.job * HALF_POINTS_PER_PT,
              }),
            ],
            tabStops: [{ type: TabStopType.LEFT, position: contentWidthTwips }],
            keepNext: true,
            spacing: { before: 200, after: 120 },
          }),
        )

        if (job.responsibilities !== '') {
          for (const paragraph of paragraphs(job.responsibilities, size))
            children.push(paragraph)
        }

        // The job story sits between the responsibilities and the achievements,
        // matching the on-screen document: it answers what the role was actually
        // like, which the responsibilities leave open and the achievements answer
        // concretely.
        if (model.options.includeStories && job.story !== '') {
          for (const paragraph of paragraphs(job.story, size, true)) children.push(paragraph)
        }

        for (const achievement of achievements) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: achievement.achievement, size })],
              bullet: { level: 0 },
              spacing: { after: 60 },
            }),
          )
          if (model.options.includeStories && achievement.story !== '') {
            for (const paragraph of paragraphs(achievement.story, size, true)) {
              children.push(
                new Paragraph({
                  ...paragraph,
                  indent: { left: 360 },
                }),
              )
            }
          }
        }
      }
    }

    // --- awards and education -------------------------------------------
    // One combined table, because that is the shape a CV uses (D16).
    if (model.awardsEducation.length > 0) {
      children.push(heading(AWARDS_SECTION_TITLE, HeadingLevel.HEADING_1))
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            ...model.awardsEducation.map(
              (entry) =>
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: String(entry.year), size })],
                        }),
                      ],
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: entry.institution, size })],
                        }),
                      ],
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({ children: [new TextRun({ text: entry.what, size })] }),
                      ],
                    }),
                  ],
                }),
            ),
          ],
        }),
      )
    }

    // --- questions -------------------------------------------------------
    if (model.questionCategories.length > 0) {
      children.push(heading('Interview questions', HeadingLevel.HEADING_1))
      for (const group of model.questionCategories) {
        children.push(heading(group.category.title, HeadingLevel.HEADING_2))
        for (const question of group.questions) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: question.question, size, bold: true })],
              spacing: { before: 120, after: 60 },
              keepNext: true,
            }),
          )
          if (question.answer !== '') {
            for (const paragraph of paragraphs(question.answer, size, true))
              children.push(paragraph)
          }
        }
      }
    }

    const document = new Document({
      title: model.profile?.title ?? 'Career Management Document',
      creator: 'Career Management Document',
      sections: [
        {
          properties: {
            // `size`, not a flat width/height: the section's page property takes
            // a size object, a margin object and so on.
            page,
          },
          children,
        },
      ],
    })

    return Packer.toBlob(document)
  },
}

/**
 * `Company: Job title`, with only the halves that are present.
 *
 * Kept in step with `DocumentView` so the Word export and the printed document
 * label a job identically — two formats that spell the same role differently is
 * the kind of drift nobody notices until someone compares them.
 */
function jobHeading(job: { company: string; jobTitle: string }): string {
  if (job.company === '') return job.jobTitle
  if (job.jobTitle === '') return job.company
  return `${job.company}: ${job.jobTitle}`
}
