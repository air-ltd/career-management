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

import type { ExportOptions, DocumentModel } from '../../export/model'
import { ExportMenu } from './ExportMenu'
import { ContentCard } from './ContentCard'
import { FormatCard } from './FormatCard'
import { PrintIcon } from '../../app/Icons'
import { usePhoneLayout } from '../../app/device'
import type { FitReport } from './FitReport'
import type { Profile, Settings } from '../../domain/types'

export function DocumentChrome({
  options,
  onOptionsChange,
  settings,
  saveSettings,
  liveProfiles,
  model,
  fit,
}: {
  options: ExportOptions
  onOptionsChange: (next: ExportOptions) => void
  settings: Settings
  saveSettings: (next: Settings) => void
  liveProfiles: Profile[]
  model: DocumentModel
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

  /**
   * Whether the rail is beside the paper or folded away above it.
   *
   * Asked of the browser rather than assumed from the screen size, so the answer
   * follows a window that is resized or a phone that is rotated.
   */
  const phone = usePhoneLayout()

  /*
   * The rail, as a value rather than as markup in the return.
   *
   * It is rendered in two shapes — a column beside the paper on a laptop, folded
   * behind a disclosure above the paper on a phone — and two copies of the
   * markup would be two copies to keep in step.
   */
  const rail = (
    <>
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
          Print / PDF
        </button>
        <ExportMenu model={model} />
      </div>

      {/*
            The profile, first of the settings: it is the name at the top of the
            document, so it is the first thing wrong when it is wrong.
          */}
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

      {/* What the document contains: one question, one card. */}
      <ContentCard options={options} onOptionsChange={onOptionsChange} />

      {/*
            The shape of the printed page: the whitespace, the type and the
            paper. They are one card because they change each other — a bigger
            type on a smaller page is a different document.
          */}
      <FormatCard
        settings={settings}
        saveSettings={saveSettings}
        model={model}
        {...(fit === null || fit === undefined ? {} : { fit })}
      />
    </>
  )

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
        {/*
          On a phone the rail folds away, because beside the paper there is no
          room for it and above the paper it would push the document down the
          screen — and the document is what the page is for.
        */}
        {phone ? (
          <details className="document-sidebar document-sidebar-folded">
            <summary>Document options</summary>
            {rail}
          </details>
        ) : (
          <div className="document-sidebar">{rail}</div>
        )}
      </div>
    </>
  )
}
