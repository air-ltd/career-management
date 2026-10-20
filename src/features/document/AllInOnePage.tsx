/**
 * The document's career content, editable on one page.
 *
 * The editing surface the legacy app had, rebuilt: everything on one scrollable
 * page, in document order, with each record on a row of its own. The separate
 * per-record routes render the same form, and are where a record is edited: the
 * row's links go to them.
 *
 * What it deliberately does *not* reproduce is the legacy behaviour of rendering
 * an edit form for every record at page load; see `InlineEditor` for why.
 *
 * The interview questions used to sit here too, at the bottom, under a heading
 * that read like another kind of work history. They are interview preparation
 * rather than a record of employment, they are read against a different document
 * preset, and a page long enough to need scrolling could not show both without one
 * of them being below the fold. They have their own page now — see
 * `QuestionsPage` — and the two share their scaffolding through `EditorShell`, so
 * the rules about stories and deleted records cannot come to differ between them.
 */

import { InlineRow, InlineSection } from './InlineRows'
import { EditorShell } from './EditorShell'
import { collapse, storyPreview, useEditorState } from './editorState'
import { OrderAnnouncement, OrderHandle } from './OrderHandle'
import { useRowOrder } from './useRowOrder'
import { sortByOrder } from '../../domain/order'
import { saveAchievementOrder } from '../shared/data'
import type { ExportOptions } from '../../export/model'
import { text } from './recordText'
import { formatDateRange, formatYear } from '../../domain/format'
import { REGISTRY } from '../shared/registry'
import type { Row } from './editorState'

export function AllInOnePage({
  now,
  options,
  onOptionsChange,
}: {
  now: Date
  options: ExportOptions
  onOptionsChange: (next: ExportOptions) => void
}) {
  const editor = useEditorState(options, onOptionsChange, now)
  const { showStories } = editor

  return (
    <EditorShell editor={editor} className="document-page all-in-one">
      <InlineSection
        title="Profiles"
        registryKey="profiles"
        onDelete={editor.deleteFrom('profiles')}
        onRecover={editor.recoverFrom('profiles')}
        records={editor.ordered('profiles')}
        describe={(record) => ({
          heading: text(record, 'name') || '(unnamed profile)',
          detail: text(record, 'email'),
        })}
        emptyText="No profiles yet."
        newHref={REGISTRY.profiles.newPath}
      />

      <InlineSection
        title="Work history"
        registryKey="jobs"
        onDelete={editor.deleteFrom('jobs')}
        onRecover={editor.recoverFrom('jobs')}
        records={editor.ordered('jobs')}
        describe={(record) => ({
          heading: `${text(record, 'company')} - ${text(record, 'jobTitle')}`,
          detail: formatDateRange(text(record, 'startDate'), endDateOf(record)),
        })}
        emptyText="No jobs yet."
        newHref={REGISTRY.jobs.newPath}
        // The responsibilities, so a role can be read without opening it. Line
        // breaks collapse to spaces so the preview stays one block. The story
        // joins them when stories are included, which is what makes a job agree
        // with the achievements below it rather than being the one type that
        // never shows one.
        preview={(record) => jobPreview(record, showStories)}
        actionsFor={(job) => (
          // The link names the job, so the form starts with it filled in rather
          // than asking which job the achievement belongs to.
          <a
            className="button button-small"
            href={`#/achievements/new?job=${encodeURIComponent(text(job, 'id'))}`}
          >
            Add achievement
          </a>
        )}
        renderChildren={(job) => (
          <AchievementsUnderJob
            job={job}
            records={editor.visible(editor.records.achievements)}
            onDelete={editor.deleteFrom('achievements')}
            onRecover={editor.recoverFrom('achievements')}
            onReorder={(ids) => {
              void saveAchievementOrder(text(job, 'id'), ids, now)
            }}
            showStories={showStories}
          />
        )}
      />

      <InlineSection
        title="Awards"
        registryKey="awards"
        onDelete={editor.deleteFrom('awards')}
        onRecover={editor.recoverFrom('awards')}
        records={editor.ordered('awards')}
        describe={(record) => ({
          heading: text(record, 'institution'),
          detail: `${formatYear(Number(record['year']))} - ${text(record, 'what')}`,
        })}
        // The story, like every other type's. Without this the section has no
        // preview at all, so its stories could not appear whatever the toggle
        // said — the same rule, or one record's story is missing because someone
        // forgot the prop.
        preview={(record) => storyPreview(text(record, 'story'), showStories)}
        emptyText="No awards yet."
        newHref={REGISTRY.awards.newPath}
      />

      <InlineSection
        title="Education"
        registryKey="education"
        onDelete={editor.deleteFrom('education')}
        onRecover={editor.recoverFrom('education')}
        records={editor.ordered('education')}
        describe={(record) => ({
          heading: text(record, 'institution'),
          detail: `${formatYear(Number(record['year']))} - ${text(record, 'what')}`,
        })}
        // The story, like every other type's, and for the same reason.
        preview={(record) => storyPreview(text(record, 'story'), showStories)}
        emptyText="No education entries yet."
        newHref={REGISTRY.education.newPath}
      />

      <p className="page-cross-link">
        <a href="#/interview">Interview questions →</a>
      </p>
    </EditorShell>
  )
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

/**
 * The achievements belonging to one job, indented beneath it.
 *
 * Indented because the parent is what gives them meaning: an achievement with no
 * job cannot be displayed anywhere, so seeing the grouping is the point.
 *
 * No count is shown. The achievements are the list; a number beside the button
 * that opens it is the same information twice, and it costs a line of height on
 * every job.
 *
 * The order is the user's, and it is the order the document prints them in. The
 * list here is sorted the same way the document is, so the arrangement the user
 * makes is the arrangement they see on the page.
 */
function AchievementsUnderJob({
  job,
  records,
  onDelete,
  onRecover,
  onReorder,
  showStories,
}: {
  job: Record<string, unknown>
  records: Row[]
  onDelete: (id: string) => void
  onRecover: (id: string) => void
  onReorder: (ids: string[]) => void
  showStories: boolean
}) {
  const jobId = text(job, 'id')
  const mine = sortByOrder(records.filter((record) => text(record, 'jobId') === jobId))
  const ids = mine.map((record) => text(record, 'id'))
  const order = useRowOrder({
    ids,
    onReorder,
    describe: (id) => {
      const record = mine.find((candidate) => text(candidate, 'id') === id)
      return record === undefined ? 'Achievement' : text(record, 'achievement')
    },
  })

  // Nothing to show: render no box at all. "No achievements" beside an add
  // button says less than the absence does.
  if (mine.length === 0) return null

  return (
    <div className="inline-children">
      <OrderAnnouncement message={order.message} />
      {mine.map((achievement, index) => {
        const id = text(achievement, 'id')
        const rowProps = order.rowProps(id, index)
        return (
          <InlineRow
            key={id}
            registryKey="achievements"
            record={achievement}
            heading={text(achievement, 'achievement')}
            detail=""
            onDelete={onDelete}
            onRecover={onRecover}
            preview={storyPreview(text(achievement, 'story'), showStories)}
            handle={<OrderHandle handleProps={order.handleProps(id, index)} />}
            drop={rowProps['data-drop']}
            onDragOver={rowProps.onDragOver}
            onDrop={rowProps.onDrop}
          />
        )
      })}
    </div>
  )
}
