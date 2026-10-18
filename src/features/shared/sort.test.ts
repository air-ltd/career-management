import { describe, expect, it } from 'vitest'
import { filterRecords, sortRecords } from './sort'
import type { SortKey } from './sort'

interface Row {
  id: string
  name: string
  updatedAt: string
}

const rows: Row[] = [
  { id: 'c', name: 'Beta', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'a', name: 'Job 10', updatedAt: '2024-03-01T00:00:00.000Z' },
  { id: 'b', name: 'Job 2', updatedAt: '2024-02-01T00:00:00.000Z' },
]

const name = (row: Row): string => row.name

const sorted = (key: SortKey): string[] => sortRecords(rows, key, name).map((row) => row.id)

describe('sortRecords', () => {
  it('leaves the given order alone for document order', () => {
    expect(sorted('document')).toEqual(['c', 'a', 'b'])
  })

  it('sorts by name, numerically, so Job 2 comes before Job 10', () => {
    expect(sorted('az')).toEqual(['c', 'b', 'a'])
  })

  it('reverses for Z to A', () => {
    expect(sorted('za')).toEqual(['a', 'b', 'c'])
  })

  it('sorts most recently edited first', () => {
    expect(sorted('newest')).toEqual(['a', 'b', 'c'])
  })

  it('sorts least recently edited first', () => {
    expect(sorted('oldest')).toEqual(['c', 'b', 'a'])
  })

  it('breaks ties by name, so equal timestamps do not flicker', () => {
    const same: Row[] = [
      { id: 'z', name: 'Zebra', updatedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'a', name: 'Aardvark', updatedAt: '2024-01-01T00:00:00.000Z' },
    ]
    expect(sortRecords(same, 'newest', name).map((row) => row.id)).toEqual(['a', 'z'])
  })

  it("does not sort the caller's array", () => {
    const original = [...rows]
    sortRecords(rows, 'az', name)
    expect(rows).toEqual(original)
  })
})

describe('filterRecords', () => {
  // Only one record carries the second field, so a match on it proves the search
  // looked past the first field rather than in it alone.
  const fields = (row: Row): string[] => [row.name, row.id === 'c' ? 'Ada Lovelace' : '']

  it('matches everything for an empty term', () => {
    expect(filterRecords(rows, '', fields)).toHaveLength(3)
  })

  it('matches everything for a whitespace-only term', () => {
    expect(filterRecords(rows, '   ', fields)).toHaveLength(3)
  })

  it('matches a substring, not just a prefix', () => {
    expect(filterRecords(rows, 'ob 1', fields).map((row) => row.id)).toEqual(['a'])
  })

  it('ignores case', () => {
    expect(filterRecords(rows, 'BETA', fields).map((row) => row.id)).toEqual(['c'])
  })

  it('searches every supplied field, not just the first', () => {
    expect(filterRecords(rows, 'Ada', fields).map((row) => row.id)).toEqual(['c'])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterRecords(rows, 'zzz', fields)).toEqual([])
  })
})
