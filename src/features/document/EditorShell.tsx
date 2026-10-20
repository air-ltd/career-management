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
          <span>Hidden {editor.undo.label}.</span>
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
      <div className="all-in-one-content">
        {/*
          Search and order for every section on this page, in one place.

          Placed above the sections rather than in the rail, because the rail holds the
          controls for the *document* and these are for the editor: the two shape
          different outputs and a user looking for a record should not have to decide
          which half of the screen it lives in.
        */}
        <div className="editor-controls">
          <div className="editor-search">
            <label htmlFor="editor-search-input">Search</label>
            <input
              id="editor-search-input"
              type="search"
              value={editor.query}
              placeholder="Company, institution, a word in any text"
              onChange={(event) => {
                editor.setQuery(event.target.value)
              }}
            />
          </div>
        </div>

        {children}
      </div>
    </section>
  )
}
