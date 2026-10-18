/**
 * The frame around a page's sections.
 *
 * Only components live here, so fast refresh keeps working; the state and the
 * helpers it renders are in `editorState`, which is where the two pages get their
 * behaviour from.
 */

import type { ReactNode } from 'react'
import { DocumentChrome } from './DocumentChrome'
import { DocumentView } from './DocumentView'
import { UndoIcon } from '../../app/Icons'
import type { EditorState } from './editorState'

/**
 * The frame around a page's sections.
 *
 * `className` distinguishes the two pages from the outside rather than by a second
 * copy of this component, so anything styled for one of them cannot silently
 * apply to the other.
 */
export function EditorShell({
  editor,
  children,
  className,
}: {
  editor: EditorState
  children: ReactNode
  className: string
}) {
  if (editor.loading) return <p className="hint">Loading…</p>

  return (
    <section className={className}>
      {/*
        The print output, not a preview: hidden on screen, shown when printing.
        See `all-in-one-print` in the stylesheet.
      */}
      <div className="all-in-one-print">
        <DocumentView model={editor.model} />
      </div>

      <DocumentChrome
        options={editor.options}
        onOptionsChange={editor.setOptions}
        settings={editor.settings}
        saveSettings={editor.saveSettings}
        liveProfiles={editor.liveProfiles}
        model={editor.model}
      />

      {editor.undo !== null && (
        <div className="undo-bar" role="status">
          <span>Deleted {editor.undo.label}.</span>
          <button type="button" className="button" onClick={editor.restore}>
            <UndoIcon />
            Undo
          </button>
        </div>
      )}

      {/*
        One grid cell for every record.

        Left to itself each `InlineSection` is a grid item, and a grid fills its
        columns before it starts a new row — so the sections flowed into both
        columns and alternated down the page. Wrapping them puts the whole list in
        the second column, which is the arrangement the document page gets from
        `.document-paper`.
      */}
      <div className="all-in-one-content">{children}</div>
    </section>
  )
}

/** A small button that toggles a child's "add" form. */
export function AddChildButton({
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
