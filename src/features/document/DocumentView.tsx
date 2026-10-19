/**
 * The document, as it will be printed.
 *
 * Rendered from the same `DocumentModel` the `.docx` exporter receives, so what
 * is on screen is what comes out of the printer and what lands in Word (D24). The
 * classes are `doc-*` rather than a second stylesheet, so the editor and the
 * document cannot drift apart (D11).
 *
 * Every text value here is rendered as a text node. Nothing is ever set as
 * markup (D13), which is the root cause of the legacy app's `&amp;` corruption.
 */

import { AWARDS_SECTION_TITLE } from '../../export/model'
import type { DocumentModel } from '../../export/model'
import { pageGeometry } from '../../export/page'
import { formatDateRange } from '../../domain/format'

/** D17: full dates in storage, month precision on the document. */
export function DocumentView({ model }: { model: DocumentModel }) {
  const geometry = pageGeometry(model.settings.pageSize)
  const stories = model.options.includeStories

  return (
    <div
      className={`doc doc-density-${model.settings.density} doc-format-${model.settings.format ?? 'compressed'}`}
      // The measurement width, in points. `getComputedStyle` then reads it back
      // as pixels, which is how the fit report converts to the page box without
      // assuming a viewport.
      style={{
        width: `${geometry.contentWidthPt}pt`,
        fontSize: `${model.settings.fontSizePt}pt`,
      }}
    >
      {model.profile === null ? (
        <p className="doc-empty">
          No profile is selected. Choose one in <a href="#/settings">Settings</a> to put your
          name and contact details at the top of the document.
        </p>
      ) : (
        <header className="doc-header">
          <h1 className="doc-title">
            {model.profile.title === '' ? model.profile.name : model.profile.title}
          </h1>
          <p className="doc-contact">
            {[
              model.profile.email,
              model.profile.phone,
              model.profile.address.split('\n').join(', '),
            ]
              .filter((line) => line !== '')
              .join('  ·  ')}
          </p>
        </header>
      )}

      {/*
        Work history, with no visible section title.

        "Work history" sat directly under the name and contact block, and the jobs
        began immediately after it, so the heading was a second line saying what the
        first job's own header — a date range and a company — already said. It
        also cost a heading's worth of space on the one document with a page target.

        The `aria-label` stays: the section is still named for a screen reader,
        which is the one context where the heading does work that the job lines
        themselves cannot.
      */}
      {model.jobs.length === 0 ? (
        <p className="doc-empty">No jobs yet.</p>
      ) : (
        <section className="doc-section doc-section-work" aria-label="Work history">
          {model.jobs.map((job) => (
            // D33: a job is never split across a page, and its heading is never
            // orphaned at the foot of one.
            <article
              key={job.id}
              className={classFor('doc-job', job.deletedAt)}
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              {/*
                `<dates>  <company>: <job title>` on one line, dates leading.

                The dates get a fixed-width column, and that is what makes the
                company names line up: every row's dates occupy the same measure,
                so every company starts in the same place. Left to size itself,
                "Jan 2020 - Mar 2024" and "Jan 2024" would push the next name to
                two different positions and the eye would re-find the left edge on
                every row.
              */}
              <div className="doc-job-head">
                <p className="doc-job-dates">{formatDateRange(job.startDate, job.endDate)}</p>
                <h2 className="doc-job-title">{jobHeading(job)}</h2>
              </div>

              {job.responsibilities !== '' && (
                <div className="doc-body">{toParagraphs(job.responsibilities)}</div>
              )}

              {/*
                The job story sits between the responsibilities and the
                achievements, not after them. It answers "what was this role
                actually like", which is the question the responsibilities leave
                open and the achievements answer concretely — so read in that
                order it holds together, and read with the story last it reads as
                an afterthought.
              */}
              {stories && job.story !== '' && (
                <div className="doc-body doc-story">{toParagraphs(job.story)}</div>
              )}

              {(model.achievementsByJob.get(job.id) ?? []).length > 0 && (
                <ul className="doc-achievements">
                  {(model.achievementsByJob.get(job.id) ?? []).map((achievement) => (
                    <li
                      key={achievement.id}
                      className={classFor('doc-achievement', achievement.deletedAt)}
                      data-fit-achievement=""
                      data-fit-job={job.id}
                      data-fit-achievement-id={achievement.id}
                    >
                      {achievement.achievement}
                      {stories && achievement.story !== '' && (
                        <span className="doc-achievement-story">
                          {toParagraphs(achievement.story)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      )}

      {model.awardsEducation.length > 0 && (
        <section className="doc-section" aria-label={AWARDS_SECTION_TITLE}>
          <h2 className="doc-section-title">{AWARDS_SECTION_TITLE}</h2>
          {/*
            D16: one combined table, real tabular data, which D34 allows.

            No column titles. Each row is a year, an institution and what it was
            for, in that order, and the order is the same for every row — a header
            row naming them costs a line on every page for a table the eye reads
            without it. `scope` on the cells would not help here either: the
            columns are what they are by position, not by label.
          */}
          <table className="doc-award-table">
            <tbody>
              {model.awardsEducation.map((entry, index) => (
                <tr
                  key={`${entry.kind}-${String(entry.year)}-${entry.institution}-${index}`}
                  className={classFor('', entry.deletedAt)}
                >
                  <td className="doc-award-year">{formatYear(entry.year)}</td>
                  <td className="doc-award-institution">{entry.institution}</td>
                  <td className="doc-award-what">
                    {entry.what}
                    {stories && entry.story !== '' && (
                      <span className="doc-award-story">{toParagraphs(entry.story)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {model.questionCategories.length > 0 && (
        <section className="doc-section" aria-label="Interview questions">
          <h2 className="doc-section-title">Interview questions</h2>
          {model.questionCategories.map((group) => (
            <div
              key={group.category.id}
              className={classFor('doc-question-group', group.category.deletedAt)}
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              <h3 className="doc-question-category">{group.category.title}</h3>
              <dl className="doc-questions">
                {group.questions.map((question) => (
                  <div
                    key={question.id}
                    className={classFor('doc-question', question.deletedAt)}
                    style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                  >
                    <dt>{question.question}</dt>
                    {question.answer !== '' && <dd>{toParagraphs(question.answer)}</dd>}
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

/**
 * Add the tombstone marker when the record has been deleted.
 *
 * Deleting a record never removes it — D51 keeps the tombstone forever, so an
 * offline device cannot resurrect a deletion. Showing them is an explicit opt-in
 * and is useful when reconciling against another device, but a page of deleted
 * records that look exactly like live ones is worse than no page: it reads as the
 * current state of a career rather than a record of what was removed.
 *
 * The class carries a colour *and* a left rule, because most browsers drop
 * background colours when printing and a document whose only signal is a tint
 * comes out of a printer looking like nothing is marked at all.
 */
function classFor(base: string, deletedAt: string | null): string {
  return deletedAt === null ? base : `${base} doc-deleted`.trim()
}

/**
 * `Company: Job title`, with only the halves that are present.
 *
 * A record with a company but no title has no colon to put anywhere, and one with
 * a title but no company has nothing to put before it. Emitting a dangling ": "
 * either way is the kind of detail that looks fine in one record and wrong in the
 * document.
 */
function jobHeading(job: { company: string; jobTitle: string }): string {
  if (job.company === '') return job.jobTitle
  if (job.jobTitle === '') return job.company
  return `${job.company}: ${job.jobTitle}`
}

function formatYear(year: number): string {
  return new Intl.DateTimeFormat('en-NZ', { year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, 0, 1)),
  )
}

/**
 * Plain text to paragraphs.
 *
 * Blank lines become paragraph breaks. Each block becomes its own element with
 * text content — never `dangerouslySetInnerHTML`, so a story containing
 * `<script>` is text on the page rather than code in it (D13).
 */
function toParagraphs(text: string): React.ReactNode[] {
  return text
    .split(/\n+/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block, index) => <p key={index}>{block}</p>)
}
