/**
 * Manual ordering.
 *
 * The rules are about what a user sees and prints, so they are checked against
 * records rather than against the code that reads them.
 */

import { describe, expect, it } from 'vitest'
import { compareByOrder, orderForNew, sortByOrder } from './order'

interface Row {
  id: string
  updatedAt: string
  order?: number
}

const row = (id: string, order?: number, updatedAt = '2024-01-01T00:00:00.000Z'): Row => ({
  id,
  updatedAt,
  ...(order === undefined ? {} : { order }),
})

describe('compareByOrder', () => {
  it('puts the lower order first', () => {
    expect(compareByOrder(row('a', 1), row('b', 2))).toBeLessThan(0)
    expect(compareByOrder(row('b', 2), row('a', 1))).toBeGreaterThan(0)
  })

  it('puts a record with an order before one without', () => {
    /*
     * This is what puts a newly added achievement at the top of a job whose other
     * achievements were written before orders existed.
     */
    expect(compareByOrder(row('a', 0), row('b'))).toBeLessThan(0)
    expect(compareByOrder(row('b'), row('a', 0))).toBeGreaterThan(0)
  })

  it('puts the older record first when neither has an order', () => {
    const older = row('a', undefined, '2023-01-01T00:00:00.000Z')
    const newer = row('b', undefined, '2024-01-01T00:00:00.000Z')
    expect(compareByOrder(older, newer)).toBeLessThan(0)
  })

  it('falls back to the id when the records are otherwise equal', () => {
    /*
     * `updatedAt` is one timestamp for a whole session — `now` is fixed when the
     * app mounts — so records created together all carry the same one. Without a
     * tie-break their order would depend on how the sort treated equal elements,
     * which is not a thing that can be relied on.
     */
    const first = row('aaa')
    const second = row('bbb')
    expect(compareByOrder(first, second)).toBeLessThan(0)
    expect(compareByOrder(second, first)).toBeGreaterThan(0)
    expect(compareByOrder(first, row('aaa'))).toBe(0)
  })
})

describe('sortByOrder', () => {
  it('sorts a mixed list the way the user would expect', () => {
    const sorted = sortByOrder([
      row('legacy-b', undefined, '2023-01-01T00:00:00.000Z'),
      row('third', 2),
      row('legacy-a', undefined, '2022-01-01T00:00:00.000Z'),
      row('first', 0),
      row('second', 1),
    ])
    expect(sorted.map((record) => record.id)).toEqual([
      'first',
      'second',
      'third',
      'legacy-a',
      'legacy-b',
    ])
  })

  it('does not change the list it was given', () => {
    const records = [row('b', 1), row('a', 0)]
    sortByOrder(records)
    expect(records.map((record) => record.id)).toEqual(['b', 'a'])
  })
})

describe('orderForNew', () => {
  it('puts a new record above the ones that are already ordered', () => {
    expect(orderForNew([row('a', 0), row('b', 1)])).toBeLessThan(0)
  })

  it('puts a new record above records that have no order at all', () => {
    /*
     * A record with an order sorts before a record without one, so any order will
     * do here — but it has to be a number, and it has to be finite.
     */
    const order = orderForNew([row('a'), row('b')])
    expect(Number.isFinite(order)).toBe(true)
    expect(compareByOrder(row('new', order), row('a'))).toBeLessThan(0)
  })

  it('is 0 when the list is empty', () => {
    expect(orderForNew([])).toBe(0)
  })

  it('goes above the lowest order, not just below zero', () => {
    expect(orderForNew([row('a', 5), row('b', 9)])).toBe(4)
  })
})

describe('a record whose identifiers are not strings', () => {
  it('is still ordered, and not stringified into nonsense', () => {
    /*
     * The comparison reads the id and the timestamp as text. A record that
     * carries a number instead of a string is not one the app writes, but the
     * comparison must not fall over on it — and it must not turn the number
     * into "[object Object]" and sort by that.
     */
    const numeric = { id: 7, updatedAt: 8, order: 1 }
    const other = { id: 9, updatedAt: 10, order: 0 }
    expect(compareByOrder(numeric, other)).toBeGreaterThan(0)
    expect(compareByOrder(numeric, numeric)).toBe(0)
  })
})
