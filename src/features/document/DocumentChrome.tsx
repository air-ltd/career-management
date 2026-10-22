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
import { FormatCard } from './FormatCard'
import { ExportMenu } from './ExportMenu'
import { ContentCard } from './ContentCard'
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
          {/*
            The two ways the document leaves, on one line.

            Printing is the browser's job (D22); the formats are a file the app
            writes. The Word export is fetched when it is chosen rather than with
            the page, which is what makes it safe to offer alongside the other two
            — the `docx` library is the largest dependency in the project and
            most sessions never reach it.
          */}
          <div className="button-row document-actions">
            <button type="button" className="button" onClick={() => window.print()}>
              <PrintIcon />
              Print / save as PDF
            </button>
            <ExportMenu model={model} />
          </div>

          {/* D36, D37: the primary control — which document, not what else is in
              it — presented the same way as the profile below it, so the rail reads
              as a list of settings rather than as a list of things of two kinds. */}
          <div className="document-field document-preset">
            <label htmlFor="document-preset">Template</label>
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

            The template is inside the format card, with the paper, the type and
            the sections: they are one choice, and they were in three places.
          */}
          <FormatCard settings={settings} saveSettings={saveSettings} now={now} />

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

          {/* The sections and what else to include: one question, one card. */}
          <ContentCard options={options} onOptionsChange={onOptionsChange} />

          {/*
            The paper, just above the estimate that is measured against it.

            The page size is the one setting whose consequence is a number rather
            than an appearance, and the number is the estimate below it: the
            estimate is the document measured against this paper. So it goes with
            the estimate rather than up with the type and the spacing.
          */}
          {/*
            The paper, just above the estimate that is measured against it.

            The page size is the one setting whose consequence is a number rather
            than an appearance, and the number is the estimate below it: the
            estimate is the document measured against this paper. So it goes with
            the estimate rather than up with the type and the spacing.
          */}
          <div className="document-field document-page-size">
            <label htmlFor="document-page-size">Page size</label>
            <select
              id="document-page-size"
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
            {/*
              D43. Browsers default the print dialog to the printer's own paper
              size and most people never change it, so a document set to A4 prints
              on whatever is in the tray while the layout was computed for A4. The
              app cannot detect or correct what the dialog does.
            */}
            <p className="field-hint">
              The print dialog has to be set to the same size. Browsers default it to the
              printer's own setting, and the layout is computed for the size chosen here.
            </p>
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
