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

      <div className="document-paper" ref={ref}>
        <DocumentView model={model} />
      </div>
    </section>
  )
}
