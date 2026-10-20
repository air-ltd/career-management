/**
 * The chrome around the document: presets and print above, profile and options
 * in a sidebar beside it.
 *
 * Used by both the document page and the edit-all page, because both produce the
 * document and both print it. Written out twice they drift — the edit page ends
 * up with presets in a different place, or an include toggle that the other page
 * does not have — and the symptom is a print button that gives a different
 * document depending on which page you pressed it from.
 */

import {
  PRESETS,
  type ExportOptions,
  type Preset,
  type DocumentModel,
} from '../../export/model'
import { IncludeOptions } from './IncludeOptions'
import { TemplatePicker } from './TemplatePicker'
import { EXPORTERS } from '../../export/exporters'
import { downloadFrom } from '../../export/exporters/download'
import { SectionOrder } from './SectionOrder'
import { PrintIcon } from '../../app/Icons'
import type { FitReport } from './FitReport'
import type { Profile, Settings } from '../../domain/types'

export function DocumentChrome({
  options,
  onOptionsChange,
  settings,
  saveSettings,
  liveProfiles,
  model,
  now,
  fit,
}: {
  options: ExportOptions
  onOptionsChange: (next: ExportOptions) => void
  settings: Settings
  saveSettings: (next: Settings) => void
  liveProfiles: Profile[]
  model: DocumentModel
  /** The clock, for the templates: one is stamped when it is written. */
  now: Date
  /**
   * The fit report, where there is a rendered document to measure.
   *
   * The edit-all page has nothing on screen to measure — its copy of the document
   * is print-only — so it passes nothing and gets no report. Rather than measure a
   * hidden element, which returns zero for everything and would report every
   * record as over-long.
   */
  fit?: { report: FitReport; over: boolean } | null
}) {
  /**
   * What the document is actually using, which is not always what is stored.
   *
   * `buildDocumentModel` falls back to the only profile when none is selected, so
   * showing nothing chosen while the document prints that profile's name would be
   * a lie about the thing the user is looking at.
   */
  const effectiveProfileId =
    settings.activeProfileId ?? (liveProfiles.length === 1 ? (liveProfiles[0]?.id ?? '') : '')

  return (
    <>
      {/*
        Everything that is interface rather than document, in a sidebar beside the
        paper rather than stacked above it.

        One container, so the print stylesheet hides all of it with a single rule.
        Listed piecemeal it becomes a set that has to be kept in step with whatever
        is added next, and it is exactly the kind of thing that gets missed: useful
        on screen, noise on paper.
      */}
      <div className="document-controls">
        <div className="document-sidebar">
          {/*
            First in the rail, above the settings it acts on.

            Printing is what the page is for, and it is the one control with no
            visible result until it is used — so it belongs where the eye lands,
            not at the foot of a list the user has to read past to reach.
          */}
          <div className="button-row document-print">
            {/* D22: print is the browser's job, not a generated file. */}
            <button type="button" className="button" onClick={() => window.print()}>
              <PrintIcon />
              Print / save as PDF
            </button>
            {/*
              The Word export is built, tested and working — but not offered.

              `downloadDocxFrom` in `export/exporters/download.ts` still does the
              whole thing, and the exporter and its tests are unchanged; only this
              button is gone. It was the largest dependency in the project and
              doubled the page weight for a feature most sessions never reached.
              Reinstating it is restoring this one line:

                  <button onClick={() => void downloadDocxFrom(model)}>Word</button>
            */}
          </div>

          {/*
            The formats the document can be taken away in.

            Two of them, and both free of a dependency: the Word exporter is
            built and tested and not offered, because the `docx` library doubled
            the page weight for a feature most sessions never reach. Markdown and
            plain text cost nothing, and between them they go nearly everywhere —
            a repository, a notebook, an email, a form that takes nothing else.

            Each says what it is, so the choice is not a surprise afterwards
            (D39).
          */}
          <div className="button-row document-export">
            {EXPORTERS.map((exporter) => (
              <button
                key={exporter.id}
                type="button"
                className="button"
                title={exporter.description}
                onClick={() => {
                  void downloadFrom(exporter, model)
                }}
              >
                {exporter.label}
              </button>
            ))}
          </div>

          {/* D36, D37: the primary control — which document, not what else is in
              it — presented the same way as the profile below it, so the rail reads
              as a list of settings rather than as a list of things of two kinds. */}
          <div className="document-field document-preset">
            <label htmlFor="document-preset">Document</label>
            <select
              id="document-preset"
              value={options.preset}
              onChange={(event) => {
                onOptionsChange(PRESETS[event.target.value as Preset].options)
              }}
            >
              {(Object.keys(PRESETS) as Preset[]).map((preset) => (
                <option key={preset} value={preset}>
                  {PRESETS[preset].label}
                </option>
              ))}
            </select>
          </div>

          {/*
            D60: the template, with the preset and the profile. The three of them
            are the three choices that decide a document, and they are all in the
            rail for the same reason — the consequence of each is visible on the
            paper beside them.
          */}
          <TemplatePicker settings={settings} saveSettings={saveSettings} now={now} />

          {/* The sections the template sets (D57), edited in place. */}
          <SectionOrder settings={settings} saveSettings={saveSettings} />

          <div className="document-field document-profile">
            <label htmlFor="document-profile">Profile</label>
            {/*
              The picker lives here rather than only in Settings because this is
              where the consequence is visible: an empty or wrong header is
              something you notice while looking at the document, not in a
              settings page you have to go and remember.
            */}
            <select
              id="document-profile"
              value={effectiveProfileId}
              onChange={(event) => {
                const value = event.target.value
                saveSettings({ ...settings, activeProfileId: value === '' ? null : value })
              }}
            >
              {liveProfiles.length === 0 && <option value="">No profiles yet</option>}
              {/*
                There is no "none" to choose. A document with no name and no contact
                details is not a CV, so the one state worth preventing is the one
                where several profiles exist and none of them is named. When that
                happens the first option is a prompt instead, which cannot be
                re-selected once a choice has been made — better than a control that
                lets the document quietly go out empty again.
              */}
              {liveProfiles.length > 1 && effectiveProfileId === '' && (
                <option value="" disabled>
                  Choose a profile
                </option>
              )}
              {liveProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name || '(unnamed)'}
                </option>
              ))}
            </select>
          </div>

          <IncludeOptions options={options} onChange={onOptionsChange} />

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

              {fit.report.overLong.length > 0 && (
                <div className="fit-records">
                  <p>
                    These will run to {fit.report.overLong[0]?.lines} lines when most are{' '}
                    {fit.report.typicalLines}:
                  </p>
                  <ul>
                    {fit.report.overLong.map((record) => (
                      <li key={record.achievementId}>
                        <a href={`#/achievements/${record.achievementId}/edit`}>
                          {jobName(model, record.jobId)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function jobName(model: { jobs: { id: string; company: string }[] }, jobId: string): string {
  return model.jobs.find((job) => job.id === jobId)?.company ?? 'a job'
}
