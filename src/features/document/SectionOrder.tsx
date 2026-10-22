/**
 * The document's sections: which are in it, in what order, and what they are
 * called.
 *
 * These are document settings, and a template is a choice of settings (D54), so
 * editing them here is editing the current settings — and "Save current as a
 * template" then captures them (D61).
 *
 * In the rail rather than in Settings, for the reason the profile picker is: the
 * consequence of what is chosen here is visible on the paper beside it.
 */

import {
  DEFAULT_SECTION_HEADINGS,
  DEFAULT_SECTION_ORDER,
  DEFAULT_SECTIONS,
  headingFor,
  nameFor,
  type SectionKey,
} from '../../domain/sections'
import type { Settings } from '../../domain/types'

export function SectionOrder({
  settings,
  saveSettings,
}: {
  settings: Settings
  saveSettings: (next: Settings) => void
}) {
  const order = settings.sectionOrder ?? DEFAULT_SECTION_ORDER
  const included = new Set(settings.sections ?? DEFAULT_SECTIONS)
  const headings = settings.sectionHeadings ?? {}

  const known = order.filter((key) => key in DEFAULT_SECTION_HEADINGS)
  const unknown = order.filter((key) => !(key in DEFAULT_SECTION_HEADINGS))

  const update = (next: {
    order?: string[]
    sections?: string[]
    headings?: Record<string, string>
  }) => {
    saveSettings({
      ...settings,
      ...(next.order === undefined ? {} : { sectionOrder: next.order }),
      ...(next.sections === undefined ? {} : { sections: next.sections }),
      ...(next.headings === undefined ? {} : { sectionHeadings: next.headings }),
    })
  }

  const move = (key: string, by: number) => {
    const next = [...known]
    const from = next.indexOf(key)
    const to = from + by
    if (from === -1 || to < 0 || to >= next.length) return
    next.splice(from, 1)
    next.splice(to, 0, key)
    update({ order: [...next, ...unknown] })
  }

  return (
    <details className="document-sections">
      <summary>Sections</summary>
      {known.map((key, index) => {
        const typed = key as SectionKey
        const shown = included.has(key)
        return (
          <div key={key} className="document-section-row">
            <label className="document-section-include">
              <input
                type="checkbox"
                checked={shown}
                onChange={(event) => {
                  const next = new Set(included)
                  if (event.target.checked) next.add(key)
                  else next.delete(key)
                  update({ sections: [...next] })
                }}
              />
              <span>{nameFor(typed, headings)}</span>
            </label>
            <div className="document-section-controls">
              <label className="sr-only" htmlFor={`section-heading-${key}`}>
                Heading for {nameFor(typed, headings)}
              </label>
              <input
                id={`section-heading-${key}`}
                type="text"
                value={headingFor(typed, headings)}
                placeholder="No heading"
                onChange={(event) => {
                  update({ headings: { ...headings, [key]: event.target.value } })
                }}
              />
              <button
                type="button"
                className="button button-small"
                aria-label={`Move ${nameFor(typed, headings)} up`}
                disabled={index === 0}
                onClick={() => {
                  move(key, -1)
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="button button-small"
                aria-label={`Move ${nameFor(typed, headings)} down`}
                disabled={index === known.length - 1}
                onClick={() => {
                  move(key, 1)
                }}
              >
                ↓
              </button>
            </div>
          </div>
        )
      })}
    </details>
  )
}
