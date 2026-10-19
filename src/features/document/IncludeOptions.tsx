/**
 * "Also include": deviations from the selected preset.
 *
 * D38 — these are deviations, never the thing the user has to assemble by hand.
 * Shown on the document page and on the edit-all page because both produce the
 * document, and a print from the edit-all page that silently ignored the toggles
 * would be a different document from the one on screen beside the button.
 */

import type { ExportOptions } from '../../export/model'

export function IncludeOptions({
  options,
  onChange,
}: {
  options: ExportOptions
  onChange: (next: ExportOptions) => void
}) {
  return (
    /*
     * Open to begin with.
     *
     * It is a disclosure over three checkboxes that change what the user is
     * looking at, and closed by default it reads as an empty box — the card is
     * there but gives away nothing, and the fit report below it quietly contradicts
     * it. Collapsing it stays available for anyone who wants the rail short.
     *
     * Left uncontrolled on purpose: `open` here only has to win the first render.
     * React does not rewrite an attribute whose prop has not changed, so the
     * summary keeps toggling normally afterwards.
     */
    <details className="document-options" open>
      <summary>Also include</summary>
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
    </details>
  )
}

/**
 * Declared as data so the three stay in step.
 *
 * Written out three times they drift — a label gets reworded on one and not the
 * other, which is how the edit-all page ends up with a print button that does not
 * do what the document page's identical toggle does.
 */
const TOGGLES: {
  key: 'includeStories' | 'includeQuestions' | 'includeDeleted'
  label: string
}[] = [
  { key: 'includeStories', label: 'Stories' },
  { key: 'includeQuestions', label: 'Interview questions' },
  { key: 'includeDeleted', label: 'Deleted records' },
]
