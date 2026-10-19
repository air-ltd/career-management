/**
 * Search, across the surfaces that offer it.
 *
 * Only the filtering half is tested here. The ordering it used to sit beside is
 * gone — the lists are newest-first and do not offer a choice — so there is nothing
 * here about sorting to test, and leaving a test that named an option the UI no
 * longer has would be a way of keeping the option alive by accident.
 */

import { describe, expect, it } from 'vitest'
import { filterRecords } from './sort'

interface Row {
  id: string
  heading: string
  detail: string
}

const rows: Row[] = [
  { id: 'a', heading: 'Alpha Systems', detail: 'Engineer · 2019' },
  { id: 'b', heading: 'Globex', detail: 'Lead · 2015' },
  { id: 'c', heading: 'Initech', detail: 'Analyst · 2021' },
]

const matched = (term: string): string[] =>
  filterRecords(rows, term, (row) => [row.heading, row.detail]).map((row) => row.id)

describe('filterRecords', () => {
  it('matches either of the two lines the row shows', () => {
    // A user searching for a year or an employer expects both to find it.
    expect(matched('alpha')).toEqual(['a'])
    expect(matched('2019')).toEqual(['a'])
    expect(matched('lead')).toEqual(['b'])
  })

  it('is not case sensitive, and ignores surrounding space', () => {
    expect(matched('  GLOBEX ')).toEqual(['b'])
  })

  it('matches everything for an empty or whitespace-only term', () => {
    // A search box that hides everything before you type is worse than one that
    // ignores itself.
    expect(matched('')).toEqual(['a', 'b', 'c'])
    expect(matched('   ')).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing rather than everything when nothing matches', () => {
    expect(matched('nothing here')).toEqual([])
  })

  it("does not filter the caller's array in place", () => {
    const before = [...rows]
    filterRecords(rows, 'alpha', (row) => [row.heading])
    expect(rows).toEqual(before)
  })
})
