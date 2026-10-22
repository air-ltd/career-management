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
import { useFitReport } from './FitReport'
import { HideRowButtons } from './HideRowButtons'
import { useCloseOpenRowOnTouchElsewhere } from './rowReveal'
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
  /*
   * The estimate, measured from the document this page already renders.
   *
   * The printed copy is laid out on the screen but not seen (see
   * `.all-in-one-print` in the stylesheet), so it can be measured: the same
   * measure, the same type and the same leading as the paper, which is what the
   * estimate is about. The hook is called before the early return below because
   * a hook cannot be called conditionally.
   */
  const { ref, report } = useFitReport(editor.model)

  // A row opened by a swipe closes when the finger touches something else.
  useCloseOpenRowOnTouchElsewhere()

  if (editor.loading) return <p className="hint">Loading…</p>

  return (
    <section className={className}>
      {/*
        The print output, not a preview: hidden on screen, shown when printing.
        See `all-in-one-print` in the stylesheet.
      */}
      <div className="all-in-one-print" ref={ref}>
        <DocumentView model={editor.model} />
      </div>

      <DocumentChrome
        options={editor.options}
        onOptionsChange={editor.setOptions}
        settings={editor.settings}
        saveSettings={editor.saveSettings}
        liveProfiles={editor.liveProfiles}
        model={editor.model}
        fit={
          report !== null
            ? {
                report,
                over: report.target !== null && report.pages > report.target,
              }
            : null
        }
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
          The control that switches the every-row mode back off.

          Fixed to the corner of the screen by the stylesheet, so a long press
          anywhere on the page leaves its way out on the screen.
          It renders nothing unless every row is showing, and only on a phone.
        */}
        <HideRowButtons />

        {/*
          Search and order for every section on this page, in one place.

          Placed above the sections rather than in the rail, because the rail holds the
          controls for the *document* and these are for the editor: the two shape
          different outputs and a user looking for a record should not have to decide
          which half of the screen it lives in.
        */}
        <div className="editor-controls">
          <div className="editor-search">
            {/*
              No label above the box, and the words in the box say what it is.
              The name is on the control rather than beside it, so the box is
              still named for a screen reader and for voice control — the words
              in a box are not an accessible name on their own.
            */}
            <input
              id="editor-search-input"
              type="search"
              aria-label="Search"
              value={editor.query}
              placeholder="text search"
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
