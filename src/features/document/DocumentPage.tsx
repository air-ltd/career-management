/**
 * The document screen: choose a preset, see the document, print it.
 *
 * The presets are the primary control (D36, D37). The granular toggles are
 * available as deviations from the selected preset, never as the thing the user
 * has to assemble by hand (D38).
 *
 * The chrome, the data and the page rule are shared with the edit-all page — see
 * `DocumentChrome` and `useDocumentSource`.
 */

import type { ExportOptions } from '../../export/model'
import { DocumentView } from './DocumentView'
import { DocumentChrome } from './DocumentChrome'
import { useFitReport } from './FitReport'
import { useDocument, usePageRule } from './useDocumentSource'
import { usePhoneLayout } from '../../app/device'

export function DocumentPage({
  now,
  options,
  onOptionsChange,
}: {
  now: Date
  options: ExportOptions
  onOptionsChange: (next: ExportOptions) => void
}) {
  // D43: the paper size comes from the document's own settings.
  const { model, settings, saveSettings, liveProfiles } = useDocument(options, now)
  usePageRule(settings.pageSize)

  const { ref, report } = useFitReport(model)

  /*
   * Whether the paper scrolls sideways on a phone.
   *
   * The card is the printed page, so on a phone it is wider than the screen and
   * scrolls inside its own box. That is right — a document shown at the width it
   * prints at is the point of it — but a scrollable region that cannot be
   * reached from the keyboard is one a keyboard user cannot scroll, so the box
   * is given focus and a name.
   */
  const phone = usePhoneLayout()

  return (
    <section className="document-page">
      <DocumentChrome
        options={options}
        onOptionsChange={onOptionsChange}
        settings={settings}
        saveSettings={saveSettings}
        liveProfiles={liveProfiles}
        model={model}
        fit={
          report !== null
            ? {
                report,
                over: report.target !== null && report.pages > report.target,
              }
            : null
        }
      />

      {/*
        The paper scrolls sideways on a phone, and a scrollable region that
        cannot be reached from the keyboard is a scrollable region a keyboard
        user cannot scroll. Making it focusable, and naming it, is what makes
        it reachable — the same way a scrollable table is given a caption.
      */}
      <div
        className="document-paper"
        ref={ref}
        {...(phone ? { tabIndex: 0, role: 'region', 'aria-label': 'The document' } : {})}
      >
        <DocumentView model={model} />
      </div>
    </section>
  )
}
