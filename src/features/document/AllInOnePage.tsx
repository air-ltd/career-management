/**
 * The whole document, editable on one page.
 *
 * The editing surface the legacy app had, rebuilt: everything on one scrollable
 * page, in document order, with each record's form opening in place. The separate
 * per-record routes still exist and render the same form — this is an additional
 * way in, not a replacement.
 *
 * What it deliberately does *not* reproduce is the legacy behaviour of rendering
 * an edit form for every record at page load; see `InlineEditor` for why.
 */

import { useState } from 'react'
import { InlineEditor, InlineRow, InlineSection } from './InlineEditor'
import { text } from './recordText'
import { formatDateRange, formatYear } from '../../domain/format'
import { REGISTRY } from '../shared/registry'
import { useFieldContext, useRecords } from '../shared/data'
import type { Field } from '../shared/fields'
import type { Mergeable } from '../../domain/types'

/** A record as it comes back from storage: loose, and narrowed where used. */
type Row = Mergeable & Record<string, unknown>

/** Newest first, tombstones last, so the live document reads top to bottom. */
function inDocumentOrder(records: Mergeable[]): Row[] {
  return [...records]
    .sort((a, b) => {
      if ((a.deletedAt === null) !== (b.deletedAt === null)) {
        return a.deletedAt === null ? -1 : 1
      }
      const left = 'startDate' in a ? String(a['startDate']) : ''
      const right = 'startDate' in b ? String(b['startDate']) : ''
      if (left !== right) return left < right ? 1 : -1
      return a.updatedAt < b.updatedAt ? -1 : 1
    })
    .map((record) => record as unknown as Row)
}

export function AllInOnePage({ now }: { now: Date }) {
  const context = useFieldContext(now)

  // `useRecords` already subscribes to the storage revision, so a save made on a
  // separate route shows up here, and so does a sync merge that lands while the
  // page is open. Using it rather than a one-shot read is the whole reason the
  // two editing surfaces cannot disagree.
  const { records: profiles, loading: profilesLoading } = useRecords<Row>('profiles')
  const { records: rawJobs, loading: jobsLoading } = useRecords<Row>('jobs')
  const { records: achievements, loading: achLoading } = useRecords<Row>('achievements')
  const { records: rawAwards, loading: awardsLoading } = useRecords<Row>('awards')
  const { records: rawEducation, loading: eduLoading } = useRecords<Row>('education')
  const { records: categories, loading: catLoading } = useRecords<Row>('questionCategories')
  const { records: questions, loading: qLoading } = useRecords<Row>('questions')

  const loading =
    profilesLoading ||
    jobsLoading ||
    achLoading ||
    awardsLoading ||
    eduLoading ||
    catLoading ||
    qLoading

  if (loading) return <p className="hint">Loading…</p>

  const jobs = inDocumentOrder(rawJobs)
  const awards = inDocumentOrder(rawAwards)
  const education = inDocumentOrder(rawEducation)

  return (
    <section className="all-in-one">
      <header className="all-in-one-head">
        <h2>Edit everything</h2>
        <p className="hint">
          The whole document on one page, in the order it appears in the document. Open a record
          to edit it in place; nothing is saved until you say so.
        </p>
      </header>

      <InlineSection
        title="Profiles"
        registryKey="profiles"
        records={profiles}
        describe={(record) => ({
          heading: text(record, 'name') || '(unnamed profile)',
          detail: text(record, 'email'),
        })}
        fields={REGISTRY.profiles.fields(context)}
        now={now}
        emptyText="No profiles yet."
      />

      <InlineSection
        title="Work history"
        registryKey="jobs"
        records={jobs}
        describe={(record) => ({
          heading: `${text(record, 'company')} - ${text(record, 'jobTitle')}`,
          detail: formatDateRange(text(record, 'startDate'), endDateOf(record)),
        })}
        fields={REGISTRY.jobs.fields(context)}
        now={now}
        emptyText="No jobs yet."
        renderChildren={(job) => (
          <AchievementsUnderJob
            job={job}
            records={achievements}
            fields={REGISTRY.achievements.fields(context)}
            now={now}
          />
        )}
      />

      <InlineSection
        title="Awards"
        registryKey="awards"
        records={awards}
        describe={(record) => ({
          heading: text(record, 'institution'),
          detail: `${formatYear(Number(record['year']))} - ${text(record, 'what')}`,
        })}
        fields={REGISTRY.awards.fields(context)}
        now={now}
        emptyText="No awards yet."
      />

      <InlineSection
        title="Education"
        registryKey="education"
        records={education}
        describe={(record) => ({
          heading: text(record, 'institution'),
          detail: `${formatYear(Number(record['year']))} - ${text(record, 'what')}`,
        })}
        fields={REGISTRY.education.fields(context)}
        now={now}
        emptyText="No education entries yet."
      />

      <InlineSection
        title="Question categories"
        registryKey="questionCategories"
        records={categories}
        describe={(record) => ({ heading: text(record, 'title'), detail: '' })}
        fields={REGISTRY.questionCategories.fields(context)}
        now={now}
        emptyText="No question categories yet."
        renderChildren={(category) => (
          <QuestionsUnderCategory
            category={category}
            records={questions}
            fields={REGISTRY.questions.fields(context)}
            now={now}
          />
        )}
      />
    </section>
  )
}

/**
 * A job's end date, or null for a current role.
 *
 * Uses the shared reader rather than `String(value)`, so a non-string stored
 * value cannot end up printed as "[object Object]" on the document.
 */
function endDateOf(record: Record<string, unknown>): string | null {
  const value = text(record, 'endDate')
  return value === '' ? null : value
}

/**
 * The achievements belonging to one job, indented beneath it.
 *
 * Indented because the parent is what gives them meaning: an achievement with no
 * job cannot be displayed anywhere, so seeing the grouping is the point.
 */
function AchievementsUnderJob({
  job,
  records,
  fields,
  now,
}: {
  job: Record<string, unknown>
  records: Row[]
  fields: readonly Field[]
  now: Date
}) {
  const jobId = text(job, 'id')
  const mine = records.filter((record) => text(record, 'jobId') === jobId)
  const [adding, setAdding] = useState(false)

  return (
    <div className="inline-children">
      <p className="inline-children-label">
        {mine.length === 0 ? 'No achievements yet.' : `${String(mine.length)} achievement(s)`}
      </p>

      {mine.map((achievement) => (
        <InlineRow
          key={text(achievement, 'id')}
          registryKey="achievements"
          record={achievement}
          heading={text(achievement, 'achievement')}
          detail=""
          fields={fields}
          now={now}
          onSaved={() => undefined}
        />
      ))}

      <button
        type="button"
        className="button"
        aria-expanded={adding}
        onClick={() => {
          setAdding((previous) => !previous)
        }}
      >
        Add achievement
      </button>

      {adding && (
        // Pre-seeded with the parent, so the new record is not created orphaned.
        <InlineEditor
          registryKey="achievements"
          record={{ jobId, achievement: '', story: '' }}
          fields={fields}
          now={now}
          onDone={() => {
            setAdding(false)
          }}
          onCancel={() => {
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

/** The questions belonging to one category, indented beneath it. */
function QuestionsUnderCategory({
  category,
  records,
  fields,
  now,
}: {
  category: Record<string, unknown>
  records: Row[]
  fields: readonly Field[]
  now: Date
}) {
  const categoryId = text(category, 'id')
  const mine = records.filter((record) => text(record, 'categoryId') === categoryId)
  const [adding, setAdding] = useState(false)

  return (
    <div className="inline-children">
      <p className="inline-children-label">
        {mine.length === 0 ? 'No questions yet.' : `${String(mine.length)} question(s)`}
      </p>

      {mine.map((question) => (
        <InlineRow
          key={text(question, 'id')}
          registryKey="questions"
          record={question}
          heading={text(question, 'question')}
          detail=""
          fields={fields}
          now={now}
          onSaved={() => undefined}
        />
      ))}

      <button
        type="button"
        className="button"
        aria-expanded={adding}
        onClick={() => {
          setAdding((previous) => !previous)
        }}
      >
        Add question
      </button>

      {adding && (
        <InlineEditor
          registryKey="questions"
          record={{ categoryId, question: '', answer: '' }}
          fields={fields}
          now={now}
          onDone={() => {
            setAdding(false)
          }}
          onCancel={() => {
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}
