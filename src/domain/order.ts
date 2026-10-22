/**
 * Manual ordering for the records that have it.
 *
 * An achievement sits in the printed document among the other achievements under
 * the same job, and the user decides which order those are in. The order of a
 * document is one of the strongest things it says — it decides which achievement
 * is read first — so it is the user's to make and not the app's to infer.
 *
 * The order is a number on the record, and it is scoped to the parent: the same
 * number means different things under different jobs, so it is only ever compared
 * with siblings.
 *
 * One module, used by the document model and by the editor, because the two
 * showing the achievements in different orders is the failure this exists to
 * prevent: the editor is where the order is changed and the document is where it
 * is read, and a reader would have no way of telling that the list they arranged
 * is not the list that printed.
 */

/** A record that can be ordered among its siblings. */
export interface Orderable {
  id?: unknown
  order?: unknown
  updatedAt?: unknown
}

/**
 * The order a record carries, if it carries one that can be used.
 *
 * `null` rather than a fallback number, because "has no order" and "has an order
 * of zero" have to be told apart: the first is a record written before this
 * existed, and the second is a record the user put first.
 */
function explicitOrder(record: Orderable): number | null {
  const value = record.order
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * A record's id or timestamp as text.
 *
 * Not `String(value)`: a value that is not a string or a number would be
 * stringified as "[object Object]", which sorts nowhere useful.
 */
function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * Compare two records by where they sit among their siblings.
 *
 * Three rules, in order:
 *
 * - A record with an order and one without: the ordered one comes first. This is
 *   what puts a newly added achievement at the top of a job whose other
 *   achievements have never been rearranged. Records written before this existed
 *   have no order, and they sort after the ones that do.
 * - Two records with orders: the lower one comes first.
 * - Two records with no order: the one updated earlier comes first.
 *
 * The last rule needs a tie-break of its own. `updatedAt` is one timestamp for a
 * whole session — `now` is fixed when the app mounts — so records created
 * together all carry the same one, and without a tie-break their order would
 * depend on how the sort happened to treat equal elements. The id decides it,
 * which is arbitrary but never changes between two reads of the same data.
 */
export function compareByOrder(a: Orderable, b: Orderable): number {
  const left = explicitOrder(a)
  const right = explicitOrder(b)

  if (left !== null && right === null) return -1
  if (left === null && right !== null) return 1
  if (left !== null && right !== null && left !== right) return left < right ? -1 : 1

  const leftUpdated = asText(a.updatedAt)
  const rightUpdated = asText(b.updatedAt)
  if (leftUpdated !== rightUpdated) return leftUpdated < rightUpdated ? -1 : 1

  const leftId = asText(a.id)
  const rightId = asText(b.id)
  if (leftId === rightId) return 0
  return leftId < rightId ? -1 : 1
}

/** The records in the order they should be shown. */
export function sortByOrder<T extends Orderable>(records: readonly T[]): T[] {
  return [...records].sort(compareByOrder)
}

/**
 * The order for a record added to the top of a list.
 *
 * One below the lowest order already in the list, so the new record goes above
 * all of them — including the ones with no order at all, which sort after
 * anything that has one.
 *
 * When nothing in the list has an order yet, this is 0, which is still above
 * them, because a record with an order sorts before a record without one.
 */
export function orderForNew(siblings: readonly Orderable[]): number {
  const orders: number[] = []
  for (const sibling of siblings) {
    const value = explicitOrder(sibling)
    if (value !== null) orders.push(value)
  }
  if (orders.length === 0) return 0
  return Math.min(...orders) - 1
}
