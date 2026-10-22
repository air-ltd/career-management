/**
 * How much whitespace the document has.
 *
 * Two settings used to decide this — the spacing and the layout — and they fought
 * each other: the compact spacing set a margin between the roles while the
 * compressed layout took it away again. A user setting one and then the other
 * could not tell which of them had won.
 *
 * So there is one setting now, and it is named for what it produces rather than
 * for the two things it used to be.
 */

import type { Settings } from './types'

export interface WhitespaceOption {
  value: string
  label: string
  /** The spacing the document is set to. */
  density: Settings['density']
  /** The layout the document is set to. */
  format: NonNullable<Settings['format']>
  /** What it does, for the tooltip. */
  description: string
}

export const WHITESPACE_OPTIONS: readonly WhitespaceOption[] = [
  {
    value: 'compact',
    label: 'Compact',
    // The spacing the app has always used, with no blank line between the
    // roles. Changing this default would change every document anyone already
    // has, which is the one thing a template's built-in must not do (D54).
    density: 'normal',
    format: 'compressed',
    description: 'No blank line between the roles.',
  },
  {
    value: 'additional',
    label: 'Additional Whitespace',
    density: 'normal',
    format: 'expanded',
    description: 'A blank line after every role.',
  },
]

/**
 * The option the document is currently set to.
 *
 * A document written before the layout existed has no layout, and one written
 * before the consolidation may have a spacing the options do not name. Both are
 * read as the closest thing: the compact spacing with no layout is the compact
 * option, and a layout that is not the expanded one is the compressed one.
 */
export function whitespaceFor(settings: Settings): string {
  const expanded = (settings.format ?? 'compressed') === 'expanded'
  const option = WHITESPACE_OPTIONS.find(
    (candidate) =>
      candidate.format === (expanded ? 'expanded' : 'compressed') &&
      candidate.density === settings.density,
  )
  if (option !== undefined) return option.value
  return expanded ? 'additional' : 'compact'
}

/** The settings an option sets. */
export function settingsForWhitespace(value: string): Pick<Settings, 'density' | 'format'> {
  const option = WHITESPACE_OPTIONS.find((candidate) => candidate.value === value)
  if (option === undefined) return { density: 'normal', format: 'compressed' }
  return { density: option.density, format: option.format }
}
