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

import { InlineRow, InlineSection } from './InlineRows'
import { EditorShell } from './EditorShell'
import { storyPreview, useEditorState, type Row } from './editorState'
import { OrderAnnouncement, OrderHandle } from './OrderHandle'
import { useRowOrder } from './useRowOrder'
import { sortByOrder } from '../../domain/order'
import { saveQuestionOrder } from '../shared/data'
import type { ExportOptions } from '../../export/model'
import { text } from './recordText'
import { REGISTRY } from '../shared/registry'

export function QuestionsPage({
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
    <EditorShell editor={editor} className="document-page all-in-one questions-page">
      <InlineSection
        title="Question categories"
        registryKey="questionCategories"
        onDelete={editor.deleteFrom('questionCategories')}
        onRecover={editor.recoverFrom('questionCategories')}
        records={editor.ordered('questionCategories')}
        describe={(record) => ({ heading: text(record, 'title'), detail: '' })}
        emptyText="No question categories yet."
        newHref={REGISTRY.questionCategories.newPath}
        preview={(record) => storyPreview(text(record, 'story'), showStories)}
        actionsFor={(category) => (
          // The link names the category, so the form starts with it filled in
          // rather than asking which category the question belongs to.
          <a
            className="button button-small"
            href={`#/questions/all/new?category=${encodeURIComponent(text(category, 'id'))}`}
          >
            Add question
          </a>
        )}
        renderChildren={(category) => (
          <QuestionsUnderCategory
            category={category}
            records={editor.visible(editor.records.questions)}
            onDelete={editor.deleteFrom('questions')}
            onRecover={editor.recoverFrom('questions')}
            onReorder={(ids) => {
              void saveQuestionOrder(text(category, 'id'), ids, now)
            }}
            showStories={showStories}
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
 *
 * The order is the user's, and it is the order the preparation document prints
 * them in. The list here is sorted the same way the document is, so the
 * arrangement the user makes is the arrangement they see on the page.
 */
function QuestionsUnderCategory({
  category,
  records,
  onDelete,
  onRecover,
  onReorder,
  showStories,
}: {
  category: Record<string, unknown>
  records: Row[]
  onDelete: (id: string) => void
  onRecover: (id: string) => void
  onReorder: (ids: string[]) => void
  showStories: boolean
}) {
  const categoryId = text(category, 'id')
  const mine = sortByOrder(
    records.filter((record) => text(record, 'categoryId') === categoryId),
  )
  const ids = mine.map((record) => text(record, 'id'))
  const order = useRowOrder({
    ids,
    onReorder,
    describe: (id) => {
      const record = mine.find((candidate) => text(candidate, 'id') === id)
      return record === undefined ? 'Question' : text(record, 'question')
    },
  })

  // Nothing to show: render no box at all. "No questions" beside an add button
  // says less than the absence does.
  if (mine.length === 0) return null

  return (
    <div className="inline-children">
      <OrderAnnouncement message={order.message} />
      {mine.map((question, index) => {
        const id = text(question, 'id')
        const rowProps = order.rowProps(id, index)
        return (
          <InlineRow
            key={id}
            registryKey="questions"
            record={question}
            heading={text(question, 'question')}
            detail=""
            onDelete={onDelete}
            onRecover={onRecover}
            // A question's answer is its story, and follows the same rule as every
            // other record's — with stories excluded there is no answer here either.
            preview={storyPreview(text(question, 'answer'), showStories)}
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
