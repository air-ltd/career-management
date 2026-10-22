/**
 * What the document contains.
 *
 * D38 — these are deviations from the selected preset, never the thing the user
 * has to assemble by hand. Shown on the document page and on the edit-all page
 * because both produce the document, and a print from the edit-all page that
 * silently ignored the toggles would be a different document from the one on
 * screen beside the button.
 *
 * The card this sits in has the title; these are the options under it.
 */

import type { ExportOptions } from '../../export/model'

const TOGGLES: {
  key:
    | 'includeWorkHistory'
    | 'includeAwards'
    | 'includeEducation'
    | 'includeStories'
    | 'includeQuestions'
    | 'includeDeleted'
  label: string
}[] = [
  { key: 'includeWorkHistory', label: 'Work history' },
  { key: 'includeAwards', label: 'Awards' },
  { key: 'includeEducation', label: 'Education' },
  { key: 'includeStories', label: 'Stories' },
  { key: 'includeQuestions', label: 'Interview questions' },
  { key: 'includeDeleted', label: 'Hidden records' },
]

export function IncludeOptions({
  options,
  onChange,
}: {
  options: ExportOptions
  onChange: (next: ExportOptions) => void
}) {
  return (
    <div className="document-includes">
      {TOGGLES.map((toggle) => (
        <label key={toggle.key}>
          <input
            type="checkbox"
            checked={options[toggle.key]}
            onChange={(event) => {
              onChange({ ...options, [toggle.key]: event.target.checked })
            }}
          />
          {toggle.label}
        </label>
      ))}
    </div>
  )
}
