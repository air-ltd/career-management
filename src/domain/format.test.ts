/**
 * Date formatting.
 *
 * Two regressions from the legacy app are pinned here, because both were crashes
 * rather than cosmetic problems: a null end date reaching `strptime` (L3), and a
 * date that is not exactly `%Y%m%d` taking the whole page down (L5).
 */

import { describe, expect, it } from 'vitest'
import { PRESENT, currentYear, formatDateRange, formatMonthYear, formatYear } from './format'

describe('formatMonthYear', () => {
  it('displays month and year from a full date (D17)', () => {
    expect(formatMonthYear('2024-01-31')).toBe('Jan 2024')
    expect(formatMonthYear('1999-12-01')).toBe('Dec 1999')
  })

  it('abbreviates September to three letters', () => {
    /*
     * `en-NZ` gives "Sept", which is not the abbreviation the document prints:
     * every other month is three letters, and "Sept" reads as a typo beside them.
     * The month names are fixed here rather than taken from `Intl`, so this holds
     * whatever ICU data the machine carries.
     */
    expect(formatMonthYear('2024-09-15')).toBe('Sep 2024')
  })

  it('is not affected by the machine timezone', () => {
    // A date at UTC midnight is the previous day in any negative-offset zone, and
    // would render as the wrong month if the parser did not pin UTC.
    expect(formatMonthYear('2024-01-01')).toBe('Jan 2024')
  })

  it('shows the stored value rather than a blank when it will not parse', () => {
    // An unparseable date is a data problem the user needs to see, not one to
    // hide behind an empty cell.
    expect(formatMonthYear('20240131')).toBe('20240131')
    expect(formatMonthYear('nonsense')).toBe('nonsense')
  })
})

describe('formatDateRange', () => {
  it('renders a null end date as "present" (L3)', () => {
    // The legacy app compared against the empty string only, so a null reached
    // `strptime(None, ...)` and raised. Null is the normal "current role" value.
    expect(formatDateRange('2024-01-31', null)).toBe('Jan 2024 - present')
  })

  it('collapses a range within one month to a single label', () => {
    expect(formatDateRange('2024-01-03', '2024-01-28')).toBe('Jan 2024')
  })

  it('spans months and years', () => {
    expect(formatDateRange('2019-06-01', '2024-03-31')).toBe('Jun 2019 - Mar 2024')
  })

  it('shows "present" as a named state, not a gap', () => {
    expect(PRESENT).toBe('present')
  })

  it('does not throw on a malformed stored date', () => {
    expect(() => formatDateRange('rubbish', null)).not.toThrow()
    expect(formatDateRange('rubbish', null)).toContain(PRESENT)
  })
})

describe('formatYear', () => {
  it('renders a year unchanged', () => {
    expect(formatYear(2024)).toBe('2024')
  })
})

describe('currentYear', () => {
  it('reads the UTC year, so a new year boundary does not depend on local time', () => {
    expect(currentYear(new Date('2024-06-15T00:00:00Z'))).toBe(2024)
  })
})
