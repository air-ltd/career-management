/**
 * The interview questions, editable on one page.
 *
 * These were the last section of the edit-all page, under a heading that read like
 * another kind of work history. They are not work history: they are preparation
 * for a conversation rather than a record of employment, they are read against the
 * interview document preset rather than the CV one, and they are worked through
 * repeatedly where the other records are maintained once and left alone.
 *
 * So they get their own page. That is not only tidiness — the edit-all page was
 * long enough that the questions sat below the fold on a laptop, which for the one
 * section most often opened on its own was the wrong trade.
 *
 * Everything that is *meant* to be the same on both pages is shared with the
 * career page through `EditorShell`: the rail, the print target, and the rules
 * about stories and deleted records. Only the sections differ.
 */

import { useState } from 'react'
import { InlineEditor, InlineRow, InlineSection } from './InlineEditor'
import { AddChildButton, EditorShell } from './EditorShell'
import { storyPreview, useEditorState, type Row } from './editorState'
import { text } from './recordText'
import { REGISTRY } from '../shared/registry'
import type { Field } from '../shared/fields'

export function QuestionsPage({ now }: { now: Date }) {
  const editor = useEditorState(now)
  const { context, showStories } = editor

  /*
   * Which category, if any, has its "add a question" form open.
   *
   * Held here rather than inside the child component so the button that opens it
   * can sit beside the category's own Edit button — the same arrangement the
   * career page uses for adding an achievement to a job, so the two pages are
   * navigated the same way.
   */
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null)
  const toggleChild = (categoryId: string) =>
    setAddingChildFor((previous) => (previous === categoryId ? null : categoryId))

  return (
    <EditorShell editor={editor} className="document-page all-in-one questions-page">
      <InlineSection
        title="Question categories"
        registryKey="questionCategories"
        onDelete={editor.deleteFrom('questionCategories')}
        records={editor.ordered('questionCategories')}
        describe={(record) => ({ heading: text(record, 'title'), detail: '' })}
        fields={REGISTRY.questionCategories.fields(context)}
        now={now}
        emptyText="No question categories yet."
        query={editor.query}
        preview={(record) => storyPreview(text(record, 'story'), showStories)}
        actionsFor={(category) => (
          <AddChildButton
            label="Add question"
            expanded={addingChildFor === text(category, 'id')}
            onClick={() => toggleChild(text(category, 'id'))}
          />
        )}
        renderChildren={(category) => (
          <QuestionsUnderCategory
            category={category}
            records={editor.visible(editor.records.questions)}
            onDelete={editor.deleteFrom('questions')}
            showStories={showStories}
            fields={REGISTRY.questions.fields(context)}
            now={now}
            adding={addingChildFor === text(category, 'id')}
            onToggleAdding={() => toggleChild(text(category, 'id'))}
          />
        )}
      />

      <p className="page-cross-link">
        <a href="#/">← Work history, awards and education</a>
      </p>
    </EditorShell>
  )
}

/**
 * The questions belonging to one category, indented beneath it.
 *
 * Indented because the parent is what gives them meaning: a question with no
 * category cannot be displayed anywhere, so seeing the grouping is the point.
 */
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

  // Nothing to show and nothing open: render no box at all. "No questions" beside
  // an add button says less than the absence does.
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
          // A question's answer is its story, and follows the same rule as every
          // other record's — with stories excluded there is no answer here either.
          preview={storyPreview(text(question, 'answer'), showStories)}
          fields={fields}
          now={now}
          onSaved={() => undefined}
        />
      ))}

      {adding && (
        // Pre-seeded with the parent, so the new record is not created orphaned.
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
