/**
 * The document's format, in one card in the rail.
 *
 * Everything about how the document looks was in three places: the settings
 * page, the rail's template picker, and the rail's section list. It is one
 * choice, and it is here — beside the paper it changes, where the consequence
 * is visible while the choice is being made.
 *
 * The template comes first because it is the whole of it: choosing one sets the
 * paper, the type, the spacing and the sections, and the fields below are what
 * that choice was made of.
 */

import { TemplatePicker } from './TemplatePicker'
import { SectionOrder } from './SectionOrder'
import { MAX_FONT_SIZE_PT, MIN_FONT_SIZE_PT, type Settings } from '../../domain/types'

export function FormatCard({
  settings,
  saveSettings,
  now,
}: {
  settings: Settings
  saveSettings: (next: Settings) => void
  now: Date
}) {
  const update = (patch: Partial<Settings>) => {
    saveSettings({ ...settings, ...patch })
  }

  return (
    /*
     * A named group of controls, and deliberately not a heading: the rail sits
     * before the paper in the document, so a heading here would be a level three
     * before the document's own level one.
     */
    <div
      className="document-field document-format"
      role="group"
      aria-labelledby="document-format-title"
    >
      <p className="document-format-title" id="document-format-title">
        Format
      </p>

      <TemplatePicker settings={settings} saveSettings={saveSettings} now={now} />

      <div className="field">
        <label htmlFor="document-page-size">Page size</label>
        <select
          id="document-page-size"
          value={settings.pageSize}
          onChange={(event) => {
            update({ pageSize: event.target.value as Settings['pageSize'] })
          }}
        >
          <option value="A4">A4</option>
          <option value="Letter">US Letter</option>
          <option value="Legal">Legal</option>
        </select>
        {/*
          D43. Browsers default the print dialog to the printer's own paper size
          and most people never change it, so a document set to A4 prints on
          whatever is in the tray while the layout was computed for A4. The app
          cannot detect or correct what the dialog does.
        */}
        <p className="field-hint">
          The print dialog has to be set to the same size. Browsers default it to the printer's
          own setting, and the layout is computed for the size chosen here.
        </p>
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
            update({ fontSizePt: Number(event.target.value) })
          }}
        />
        <p className="field-hint">
          Printed only. The app will not shrink text to make the document fit — it will tell you
          what to shorten instead.
        </p>
      </div>

      <div className="field">
        <label htmlFor="document-density">Spacing</label>
        <select
          id="document-density"
          value={settings.density}
          onChange={(event) => {
            update({ density: event.target.value as Settings['density'] })
          }}
        >
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="comfortable">Comfortable</option>
        </select>
        <p className="field-hint">
          Changes spacing rather than type size, so a page can be reclaimed without making the
          text harder to read.
        </p>
      </div>

      <div className="field">
        <label htmlFor="document-format">Layout</label>
        <select
          id="document-format"
          value={settings.format ?? 'compressed'}
          onChange={(event) => {
            update({ format: event.target.value as NonNullable<Settings['format']> })
          }}
        >
          <option value="compressed">Compressed</option>
          <option value="expanded">Expanded</option>
        </select>
        <p className="field-hint">
          Expanded puts a blank line after every role. A role reduced to a single line gets
          none, because there is no content to separate.
        </p>
      </div>

      {/* The sections the template sets (D57), edited in place. */}
      <SectionOrder settings={settings} saveSettings={saveSettings} />
    </div>
  )
}
