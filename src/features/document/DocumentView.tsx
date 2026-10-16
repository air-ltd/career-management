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

import type { DocumentModel } from '../../export/model'
import { pageGeometry } from '../../export/page'
import { formatDateRange } from '../../domain/format'

/** D17: full dates in storage, month precision on the document. */
export function DocumentView({ model }: { model: DocumentModel }) {
  const geometry = pageGeometry(model.settings.pageSize)
  const stories = model.options.includeStories

  return (
    <div
      className={`doc doc-density-${model.settings.density}`}
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

      {model.jobs.length === 0 ? (
        <p className="doc-empty">No jobs yet.</p>
      ) : (
        <section className="doc-section" aria-label="Work history">
          <h2 className="doc-section-title">Work history</h2>

          {model.jobs.map((job) => (
            // D33: a job is never split across a page, and its heading is never
            // orphaned at the foot of one.
            <article
              key={job.id}
              className="doc-job"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              <h3 className="doc-job-title">
                <span className="doc-job-company">{job.company}</span>
                {job.jobTitle !== '' && <span className="doc-job-role"> - {job.jobTitle}</span>}
              </h3>
              <p className="doc-job-dates">{formatDateRange(job.startDate, job.endDate)}</p>

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
                      className="doc-achievement"
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
        <section className="doc-section" aria-label="Awards and education">
          <h2 className="doc-section-title">Awards and education</h2>
          {/* D16: one combined table, real tabular data, which D34 allows. */}
          <table className="doc-award-table">
            <thead>
              <tr>
                <th className="doc-award-year">Year</th>
                <th className="doc-award-institution">Institution</th>
                <th className="doc-award-what">What</th>
              </tr>
            </thead>
            <tbody>
              {model.awardsEducation.map((entry, index) => (
                <tr key={`${entry.kind}-${String(entry.year)}-${entry.institution}-${index}`}>
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
              className="doc-question-group"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              <h3 className="doc-question-category">{group.category.title}</h3>
              <dl className="doc-questions">
                {group.questions.map((question) => (
                  <div
                    key={question.id}
                    className="doc-question"
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
