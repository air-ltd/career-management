/**
 * The document's career content, editable on one page.
 *
 * The editing surface the legacy app had, rebuilt: everything on one scrollable
 * page, in document order, with each record's form opening in place. The separate
 * per-record routes still exist and render the same form — this is an additional
 * way in, not a replacement.
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

import { useState } from 'react'
import { InlineEditor, InlineRow, InlineSection } from './InlineEditor'
import { EditorShell, AddChildButton } from './EditorShell'
import { collapse, storyPreview, useEditorState } from './editorState'
import { text } from './recordText'
import { formatDateRange, formatYear } from '../../domain/format'
import { REGISTRY } from '../shared/registry'
import type { Field } from '../shared/fields'
import type { Row } from './editorState'

export function AllInOnePage({ now }: { now: Date }) {
  const editor = useEditorState(now)
  const { context, showStories } = editor

  // Which job, if any, has its "add an achievement" form open. Held here rather
  // than inside the child component so the button that opens it can sit beside
  // the parent's own Edit button.
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null)
  const toggleChild = (jobId: string) =>
    setAddingChildFor((previous) => (previous === jobId ? null : jobId))

  return (
    <EditorShell editor={editor} className="document-page all-in-one">
      <InlineSection
        title="Profiles"
        registryKey="profiles"
        onDelete={editor.deleteFrom('profiles')}
        records={editor.ordered('profiles')}
        describe={(record) => ({
          heading: text(record, 'name') || '(unnamed profile)',
          detail: text(record, 'email'),
        })}
        fields={REGISTRY.profiles.fields(context)}
        now={now}
        emptyText="No profiles yet."
        query={editor.query}
      />

      <InlineSection
        title="Work history"
        registryKey="jobs"
        onDelete={editor.deleteFrom('jobs')}
        records={editor.ordered('jobs')}
        describe={(record) => ({
          heading: `${text(record, 'company')} - ${text(record, 'jobTitle')}`,
          detail: formatDateRange(text(record, 'startDate'), endDateOf(record)),
        })}
        fields={REGISTRY.jobs.fields(context)}
        now={now}
        emptyText="No jobs yet."
        query={editor.query}
        // The responsibilities, so a role can be read without opening it. Line
        // breaks collapse to spaces so the preview stays one block. The story
        // joins them when stories are included, which is what makes a job agree
        // with the achievements below it rather than being the one type that
        // never shows one.
        preview={(record) => jobPreview(record, showStories)}
        actionsFor={(job) => (
          <AddChildButton
            label="Add achievement"
            expanded={addingChildFor === text(job, 'id')}
            onClick={() => toggleChild(text(job, 'id'))}
          />
        )}
        renderChildren={(job) => (
          <AchievementsUnderJob
            job={job}
            records={editor.visible(editor.records.achievements)}
            onDelete={editor.deleteFrom('achievements')}
            showStories={showStories}
            fields={REGISTRY.achievements.fields(context)}
            now={now}
            adding={addingChildFor === text(job, 'id')}
            onToggleAdding={() => toggleChild(text(job, 'id'))}
          />
        )}
      />

      <InlineSection
        title="Awards"
        registryKey="awards"
        onDelete={editor.deleteFrom('awards')}
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
        fields={REGISTRY.awards.fields(context)}
        now={now}
        emptyText="No awards yet."
        query={editor.query}
      />

      <InlineSection
        title="Education"
        registryKey="education"
        onDelete={editor.deleteFrom('education')}
        records={editor.ordered('education')}
        describe={(record) => ({
          heading: text(record, 'institution'),
          detail: `${formatYear(Number(record['year']))} - ${text(record, 'what')}`,
        })}
        // The story, like every other type's, and for the same reason.
        preview={(record) => storyPreview(text(record, 'story'), showStories)}
        fields={REGISTRY.education.fields(context)}
        now={now}
        emptyText="No education entries yet."
        query={editor.query}
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
