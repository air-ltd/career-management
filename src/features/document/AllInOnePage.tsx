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
import { DocumentView } from './DocumentView'
import { DocumentChrome } from './DocumentChrome'
import { useDocument, usePageRule } from './useDocumentSource'
import { InlineEditor, InlineRow, InlineSection } from './InlineEditor'
import { text } from './recordText'
import { formatDateRange, formatYear } from '../../domain/format'
import { REGISTRY } from '../shared/registry'
import { deleteRecord, restoreRecord, useFieldContext, useRecords } from '../shared/data'
import { PRESETS, type ExportOptions } from '../../export/model'
import { UndoIcon } from '../../app/Icons'
import type { Field } from '../shared/fields'
import type { Mergeable } from '../../domain/types'
import type { RegistryKey } from '../shared/registry'

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

  /*
   * The document, and the options that shape it.
   *
   * The editor is the editing surface; this is what the Print button prints. It is
   * not shown — a second copy of the document beside the editor is a scrolling
   * duplicate of a page the user can already go to — but it is built and kept
   * live, so the print button produces the document rather than a printout of the
   * editor. It shares the document page's chrome, so the two print buttons give
   * the same document.
   */
  const [options, setOptions] = useState<ExportOptions>(PRESETS['cv'].options)
  const { model, settings, saveSettings, liveProfiles } = useDocument(options, now)
  usePageRule(settings.pageSize)

  /*
   * The last deleted record, so the delete can be taken back.
   *
   * A tombstone is not an absence: the record is still in the database with a
   * `deletedAt`, so undo is a second write rather than a reload, and nothing the
   * user can still see behind "deleted records" is lost. Same behaviour as the
   * list views, because a delete that is undoable in one place and not the other
   * teaches the user which place not to trust.
   */
  const [undo, setUndo] = useState<{ key: RegistryKey; id: string; label: string } | null>(null)

  /**
   * A delete handler for one section.
   *
   * Built from the section's own records so the undo message can name what was
   * deleted, which is the difference between "Deleted achievement" and something
   * the user can act on.
   */
  const deleteFrom =
    (key: RegistryKey, records: Row[]) =>
    (id: string): void => {
      const record = records.find((row) => text(row, 'id') === id)
      void deleteRecord(key, id, now).then(() => {
        setUndo({
          key,
          id,
          label: record ? REGISTRY[key].describe(record, context).heading : 'Record',
        })
      })
    }

  // Which parent, if any, has its "add a child" form open. Held here rather than
  // inside the child component so the button that opens it can sit beside the
  // parent's own Edit button.
  const [addingChildFor, setAddingChildFor] = useState<{
    kind: 'achievement' | 'question'
    parentId: string
  } | null>(null)

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

  /*
   * What the editor pane shows, which the rail controls.
   *
   * Two rules, both taken from the options rather than applied per record type:
   *
   * Stories. Each type used to pick its own preview — a job showed its
   * responsibilities, an achievement showed its story, a category showed its
   * story — so "some stories are shown, some are not" was not a bug in one of
   * them but the rule being absent. Now a story is shown exactly when the
   * document would show it: with stories excluded, no record shows one at all;
   * with them included, every record shows its own. The job also keeps its
   * responsibilities, which is not a story and does not come and go with them.
   *
   * Deleted records. They were always listed, so "show deleted" did nothing — the
   * one state where the toggle should have mattered was the only one it was stuck
   * on. Tombstones are now listed only when asked for, which is what reconciling
   * against another device is for. When they are listed they carry the same
   * marking they get in the document (`InlineRow` already does this).
   */
  const showStories = options.includeStories
  const showDeleted = options.includeDeleted
  const visible = (records: Row[]) =>
    showDeleted ? records : records.filter((record) => text(record, 'deletedAt') === '')

  const jobs = visible(inDocumentOrder(rawJobs))
  const awards = visible(inDocumentOrder(rawAwards))
  const education = visible(inDocumentOrder(rawEducation))
  // The children of a job or category, filtered the same way, so a hidden parent
  // does not leave its records hanging on their own.
  const visibleAchievements = visible(achievements)
  const visibleQuestions = visible(questions)

  return (
    <section className="document-page all-in-one">
      {/*
        The print output, not a preview: hidden on screen, shown when printing.
        See `all-in-one-print` in the stylesheet.
      */}
      <div className="all-in-one-print">
        <DocumentView model={model} />
      </div>

      <DocumentChrome
        options={options}
        onOptionsChange={setOptions}
        settings={settings}
        saveSettings={saveSettings}
        liveProfiles={liveProfiles}
        model={model}
      />

      {undo !== null && (
        <div className="undo-bar" role="status">
          <span>Deleted {undo.label}.</span>
          <button
            type="button"
            className="button"
            onClick={() => {
              const target = undo
              setUndo(null)
              void restoreRecord(target.key, target.id, now)
            }}
          >
            <UndoIcon />
            Undo
          </button>
        </div>
      )}

      {/*
        One grid cell for every record.

        Left to itself each `InlineSection` is a grid item, and a grid fills its
        columns before it starts a new row — so the sections flowed into both
        columns and alternated down the page: work history under the sidebar,
        awards beside it, education back under the sidebar. Wrapping them puts the
        whole list in the second column, which is the arrangement the document page
        gets from `.document-paper`.
      */}
      <div className="all-in-one-content">
        <InlineSection
          title="Profiles"
          registryKey="profiles"
          onDelete={deleteFrom('profiles', profiles)}
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
          onDelete={deleteFrom('jobs', rawJobs)}
          records={jobs}
          describe={(record) => ({
            heading: `${text(record, 'company')} - ${text(record, 'jobTitle')}`,
            detail: formatDateRange(text(record, 'startDate'), endDateOf(record)),
          })}
          fields={REGISTRY.jobs.fields(context)}
          now={now}
          emptyText="No jobs yet."
          // The responsibilities, so a role can be read without opening it. Line
          // breaks collapse to spaces so the preview stays one block. The story
          // joins them when stories are included, which is what makes a job agree
          // with the achievements and categories below it rather than being the
          // one type that never shows one.
          preview={(record) => jobPreview(record, showStories)}
          actionsFor={(job) => (
            <AddChildButton
              label="Add achievement"
              expanded={
                addingChildFor?.kind === 'achievement' &&
                addingChildFor.parentId === text(job, 'id')
              }
              onClick={() =>
                setAddingChildFor((previous) =>
                  previous?.kind === 'achievement' && previous.parentId === text(job, 'id')
                    ? null
                    : { kind: 'achievement', parentId: text(job, 'id') },
                )
              }
            />
          )}
          renderChildren={(job) => (
            <AchievementsUnderJob
              job={job}
              records={visibleAchievements}
              onDelete={deleteFrom('achievements', achievements)}
              showStories={showStories}
              fields={REGISTRY.achievements.fields(context)}
              now={now}
              adding={
                addingChildFor?.kind === 'achievement' &&
                addingChildFor.parentId === text(job, 'id')
              }
              onToggleAdding={() =>
                setAddingChildFor((previous) =>
                  previous?.kind === 'achievement' && previous.parentId === text(job, 'id')
                    ? null
                    : { kind: 'achievement', parentId: text(job, 'id') },
                )
              }
            />
          )}
        />

        <InlineSection
          title="Awards"
          registryKey="awards"
          onDelete={deleteFrom('awards', rawAwards)}
          records={awards}
          describe={(record) => ({
            heading: text(record, 'institution'),
            detail: `${formatYear(Number(record['year']))} - ${text(record, 'what')}`,
          })}
          // The story, like every other type's. Without this the section has no
          // preview at all, so its stories could not appear whatever the toggle
          // said — the same rule, or one record's story is missing because
          // someone forgot the prop.
          preview={(record) => storyPreview(text(record, 'story'), showStories)}
          fields={REGISTRY.awards.fields(context)}
          now={now}
          emptyText="No awards yet."
        />

        <InlineSection
          title="Education"
          registryKey="education"
          onDelete={deleteFrom('education', rawEducation)}
          records={education}
          describe={(record) => ({
            heading: text(record, 'institution'),
            detail: `${formatYear(Number(record['year']))} - ${text(record, 'what')}`,
          })}
          // The story, like every other type's. Without this the section has no
          // preview at all, so its stories could not appear whatever the toggle
          // said — the same rule, or one record's story is missing because
          // someone forgot the prop.
          preview={(record) => storyPreview(text(record, 'story'), showStories)}
          fields={REGISTRY.education.fields(context)}
          now={now}
          emptyText="No education entries yet."
        />

        <InlineSection
          title="Question categories"
          registryKey="questionCategories"
          onDelete={deleteFrom('questionCategories', categories)}
          records={visible(categories)}
          describe={(record) => ({ heading: text(record, 'title'), detail: '' })}
          fields={REGISTRY.questionCategories.fields(context)}
          now={now}
          emptyText="No question categories yet."
          preview={(record) => storyPreview(text(record, 'story'), showStories)}
          actionsFor={(category) => (
            <AddChildButton
              label="Add question"
              expanded={
                addingChildFor?.kind === 'question' &&
                addingChildFor.parentId === text(category, 'id')
              }
              onClick={() =>
                setAddingChildFor((previous) =>
                  previous?.kind === 'question' && previous.parentId === text(category, 'id')
                    ? null
                    : { kind: 'question', parentId: text(category, 'id') },
                )
              }
            />
          )}
          renderChildren={(category) => (
            <QuestionsUnderCategory
              category={category}
              records={visibleQuestions}
              onDelete={deleteFrom('questions', questions)}
              showStories={showStories}
              fields={REGISTRY.questions.fields(context)}
              now={now}
              adding={
                addingChildFor?.kind === 'question' &&
                addingChildFor.parentId === text(category, 'id')
              }
              onToggleAdding={() =>
                setAddingChildFor((previous) =>
                  previous?.kind === 'question' && previous.parentId === text(category, 'id')
                    ? null
                    : { kind: 'question', parentId: text(category, 'id') },
                )
              }
            />
          )}
        />
      </div>
    </section>
  )
}

/**
 * A record's story, or nothing.
 *
 * One shape for every type — a job, an achievement, a category, a question's
 * answer — so a story cannot be italic in one and not in another, or present in
 * one and absent from another, without that being visible here.
 *
 * Returns nothing when stories are excluded, rather than an empty string: the
 * empty string still rendered an empty paragraph, and an empty paragraph is not
 * the same as no preview at all.
 */
function storyPreview(story: string, showStories: boolean): React.ReactNode {
  if (!showStories) return null
  const collapsed = collapse(story)
  return collapsed === '' ? null : <p className="inline-row-story">{collapsed}</p>
}

/**
 * A job's preview: its responsibilities, and below them its story.
 *
 * Two blocks, not one joined with a space. A role's responsibilities are what it
 * did and its story is what it was like — read as one run they are a single
 * sentence about the role, and read as two the job matches the achievements and
 * categories below it, which are each their own line.
 */
function jobPreview(record: Record<string, unknown>, showStories: boolean): React.ReactNode {
  const responsibilities = collapse(text(record, 'responsibilities'))
  const story = showStories ? collapse(text(record, 'story')) : ''
  const blocks: React.ReactNode[] = []

  if (responsibilities !== '') blocks.push(<p key="responsibilities">{responsibilities}</p>)
  if (story !== '')
    blocks.push(
      <p key="story" className="inline-row-story">
        {story}
      </p>,
    )

  return blocks.length === 0 ? null : blocks
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

/** A small button that toggles a child's "add" form. */
function AddChildButton({
  label,
  expanded,
  onClick,
}: {
  label: string
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="button button-small"
      aria-expanded={expanded}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/**
 * The achievements belonging to one job, indented beneath it.
 *
 * Indented because the parent is what gives them meaning: an achievement with no
 * job cannot be displayed anywhere, so seeing the grouping is the point.
 *
 * No count is shown. The achievements are the list; a number beside the button
 * that opens it is the same information twice, and it costs a line of height on
 * every job.
 */
function AchievementsUnderJob({
  job,
  records,
  onDelete,
  showStories,
  fields,
  now,
  adding,
  onToggleAdding,
}: {
  job: Record<string, unknown>
  records: Row[]
  onDelete: (id: string) => void
  showStories: boolean
  fields: readonly Field[]
  now: Date
  adding: boolean
  onToggleAdding: () => void
}) {
  const jobId = text(job, 'id')
  const mine = records.filter((record) => text(record, 'jobId') === jobId)

  // Nothing to show and nothing open: render no box at all. "No achievements"
  // beside an add button says less than the absence does.
  if (mine.length === 0 && !adding) return null

  return (
    <div className="inline-children">
      {mine.map((achievement) => (
        <InlineRow
          key={text(achievement, 'id')}
          registryKey="achievements"
          record={achievement}
          heading={text(achievement, 'achievement')}
          detail=""
          onDelete={onDelete}
          preview={storyPreview(text(achievement, 'story'), showStories)}
          fields={fields}
          now={now}
          onSaved={() => undefined}
        />
      ))}

      {adding && (
        // Pre-seeded with the parent, so the new record is not created orphaned.
        <InlineEditor
          registryKey="achievements"
          record={{ jobId, achievement: '', story: '' }}
          fields={fields}
          now={now}
          onDone={onToggleAdding}
          onCancel={onToggleAdding}
        />
      )}
    </div>
  )
}

/** The questions belonging to one category, indented beneath it. */
function QuestionsUnderCategory({
  category,
  records,
  onDelete,
  showStories,
  fields,
  now,
  adding,
  onToggleAdding,
}: {
  category: Record<string, unknown>
  records: Row[]
  onDelete: (id: string) => void
  showStories: boolean
  fields: readonly Field[]
  now: Date
  adding: boolean
  onToggleAdding: () => void
}) {
  const categoryId = text(category, 'id')
  const mine = records.filter((record) => text(record, 'categoryId') === categoryId)

  if (mine.length === 0 && !adding) return null

  return (
    <div className="inline-children">
      {mine.map((question) => (
        <InlineRow
          key={text(question, 'id')}
          registryKey="questions"
          record={question}
          heading={text(question, 'question')}
          detail=""
          onDelete={onDelete}
          preview={storyPreview(text(question, 'answer'), showStories)}
          fields={fields}
          now={now}
          onSaved={() => undefined}
        />
      ))}

      {adding && (
        <InlineEditor
          registryKey="questions"
          record={{ categoryId, question: '', answer: '' }}
          fields={fields}
          now={now}
          onDone={onToggleAdding}
          onCancel={onToggleAdding}
        />
      )}
    </div>
  )
}

/**
 * Body text onto one line for a preview.
 *
 * Display only. The stored text keeps its paragraph breaks, so the document and
 * the Word export are unaffected — and nothing is truncated here, only in CSS
 * (D31).
 */
function collapse(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ').trim()
}
