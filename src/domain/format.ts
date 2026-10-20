/**
 * Date formatting for the document.
 *
 * The asymmetry this module exists to enforce: dates are *stored* at full
 * `YYYY-MM-DD` precision (D17) and *displayed* as `Mon YYYY`, which is CV
 * convention and matches what the legacy document printed. Everything that
 * shows a date goes through here, so there is one place where that rule lives.
 *
 * Pure functions with no clock reads, so a date renders the same in a test as it
 * does in the document.
 */

/**
 * The three-letter month abbreviations, fixed rather than taken from `Intl`.
 *
 * `en-NZ` renders September as "Sept", which is not the abbreviation the document
 * prints: every other month is three letters, and "Sept" reads as a typo beside
 * them. Fixed here, so the document does not depend on which ICU data the machine
 * running it happens to carry.
 */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** `2024` → `2024`. Years are already strings when they reach the document. */
const YEAR = new Intl.DateTimeFormat('en-NZ', {
  year: 'numeric',
  timeZone: 'UTC',
})

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * The raw ISO date, shown only when it will not parse.
 *
 * An unparseable date in the document is a data problem the user needs to see,
 * not a blank to hide. Showing the stored value is unhelpful but honest, and it
 * keeps the rest of the document readable — the same reasoning as the reference
 * project's `dayHeading`.
 */
export function formatMonthYear(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  return `${MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`
}

export function formatYear(year: number): string {
  return YEAR.format(new Date(Date.UTC(year, 0, 1)))
}

/** `Jan 2024` for a null end date, matching the legacy document's "present". */
export const PRESENT = 'present'

/**
 * A job's date range, as the document shows it.
 *
 * Two decisions worth stating:
 *
 * - A null end date is "present", not a blank. The legacy app only checked for
 *   the empty string, so a null reached `strptime(None, ...)` and took the page
 *   down with it (L3).
 * - When both dates fall in the same month the day range is shown, because
 *   "Jan 2024 – Jan 2024" is worse than useless. Everything else collapses to
 *   month and year.
 */
export function formatDateRange(startDate: string, endDate: string | null): string {
  const start = formatMonthYear(startDate)
  if (endDate === null) return `${start} - ${PRESENT}`
  const end = formatMonthYear(endDate)
  return start === end ? start : `${start} - ${end}`
}

/** The current year, for defaulting award and education years. */
export function currentYear(now: Date): number {
  return now.getUTCFullYear()
}
