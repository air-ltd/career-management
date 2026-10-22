/**
 * The format: the whitespace, the type and the paper.
 *
 * One card, in the rail beside the document, because these three are the shape
 * of the printed page and each of them changes what the other two can do.
 *
 * The whitespace is one setting rather than two — the spacing and the layout
 * used to be separate controls deciding the same thing, and they fought: the
 * compact spacing put a margin between the roles and the compressed layout took
 * it away again, so setting one and then the other left no way of telling which
 * had won.
 */

import type { DocumentModel } from '../../export/model'
import { useDisclosure } from './useDisclosure'
import type { FitReport } from './FitReport'
import { MAX_FONT_SIZE_PT, MIN_FONT_SIZE_PT, type Settings } from '../../domain/types'
import {
  WHITESPACE_OPTIONS,
  settingsForWhitespace,
  whitespaceFor,
} from '../../domain/whitespace'

export function FormatCard({
  settings,
  saveSettings,
  fit,
  model,
}: {
  settings: Settings
  saveSettings: (next: Settings) => void
  /**
   * The estimate, when there is a document to measure.
   *
   * It lives in this card because it is the document measured against these
   * settings: the paper, the type and the whitespace decide how many pages it
   * runs to, and the number is the answer to all three.
   */
  fit?: { report: FitReport; over: boolean } | null
  /** The document, for the names of the records the estimate names. */
  model?: DocumentModel
}) {
  const { open, setOpen } = useDisclosure('format')

  return (
    <details
      className="document-field document-format"
      open={open}
      onToggle={(event) => {
        setOpen((event.target as HTMLDetailsElement).open)
      }}
    >
      <summary className="document-format-title">Format</summary>

      <div className="field">
        <label htmlFor="document-whitespace">Whitespace</label>
        <select
          id="document-whitespace"
          value={whitespaceFor(settings)}
          onChange={(event) => {
            saveSettings({ ...settings, ...settingsForWhitespace(event.target.value) })
          }}
        >
          {WHITESPACE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="document-font-size">Type size: {settings.fontSizePt}pt</label>
        <input
          id="document-font-size"
          type="range"
          min={MIN_FONT_SIZE_PT}
          max={MAX_FONT_SIZE_PT}
          step={1}
          value={settings.fontSizePt}
          onChange={(event) => {
            saveSettings({ ...settings, fontSizePt: Number(event.target.value) })
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="document-page-size">Page size</label>
        <select
          id="document-page-size"
          // A tooltip rather than a paragraph under the control: it is a warning
          // about the print dialog, which the browser decides and the app cannot
          // see, and a paragraph of it is a lot of a narrow rail.
          title="The print dialog has to be set to the same size. Browsers default it to the printer's own setting, and the layout is computed for the size chosen here."
          value={settings.pageSize}
          onChange={(event) => {
            saveSettings({
              ...settings,
              pageSize: event.target.value as Settings['pageSize'],
            })
          }}
        >
          <option value="A4">A4</option>
          <option value="Letter">US Letter</option>
          <option value="Legal">Legal</option>
        </select>
      </div>

      {/*
        D32. For the CV preset only: an estimated page count against the target,
        and the specific records to shorten. Never an auto-fit, and never a
        warning on interview preparation (D40).
      */}
      {fit !== null && fit !== undefined && (
        <div className={fit.over ? 'fit-report fit-over' : 'fit-report'} role="status">
          <p>
            Estimated {fit.report.pages} {fit.report.pages === 1 ? 'page' : 'pages'}
            {fit.report.target !== null && (
              <>
                {' '}
                (target {fit.report.target}) — <em>an estimate</em>
              </>
            )}
          </p>

          {fit.report.target !== null && (
            <p className="fit-hint">
              {fit.over
                ? 'The app will not shrink the text to make this fit. Shorten the records below.'
                : 'Nothing to shorten. If it prints over a page, it will say so here.'}
            </p>
          )}

          {fit.report.overLong.length > 0 && model !== undefined && (
            <div className="fit-records">
              <p>
                These will run to {fit.report.overLong[0]?.lines} lines when most are{' '}
                {fit.report.typicalLines}:
              </p>
              <ul>
                {fit.report.overLong.map((record) => (
                  <li key={record.achievementId}>
                    <a href={`#/achievements/${record.achievementId}/edit`}>
                      {model.jobs.find((job) => job.id === record.jobId)?.company ?? 'a job'}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </details>
  )
}
