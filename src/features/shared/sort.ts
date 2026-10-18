/**
 * Ordering and filtering for the lists.
 *
 * Both live here rather than in a component because two surfaces need them and
 * they must agree: the per-entity list views and the all-in-one editor. Sorting
 * in one place and not the other is how a section ends up ordered one way on the
 * editor and another way on its own page.
 *
 * "Document order" is the default everywhere, and that is a deliberate choice
 * rather than an absence of one. The legacy app ordered jobs by `start_date desc`
 * in SQL and achievements by `obsolete, last_update_date desc` — an ordering
 * nobody chose, which is exactly why it is called out as a defect (U10). Changing
 * it is the user's decision to make, so the app ships with what they already have
 * and offers the alternatives rather than picking for them.
 */

export type SortKey = 'document' | 'az' | 'za' | 'newest' | 'oldest'

export const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'document', label: 'Document order' },
  { key: 'az', label: 'Name, A to Z' },
  { key: 'za', label: 'Name, Z to A' },
  { key: 'newest', label: 'Recently edited' },
  { key: 'oldest', label: 'Least recently edited' },
]

/** What a record must expose to be ordered. */
export interface Sortable {
  updatedAt: string
}

/**
 * A comparison that is total and stable.
 *
 * `localeCompare` with an explicit numeric option, because "Job 10" sorting before
 * "Job 2" is the sort nobody expects, and because the default collation puts
 * punctuation somewhere surprising. Every comparison falls back to `id` so that
 * two records with the same name have a defined order — without that, "Recently
 * edited" reorders records that share an `updatedAt`, which reads as the list
 * flickering.
 */
function byHeading<T extends Sortable & { id: string }>(
  a: T,
  b: T,
  headingOf: (record: T) => string,
): number {
  const left = headingOf(a)
  const right = headingOf(b)
  const byName = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  return byName !== 0 ? byName : a.id.localeCompare(b.id)
}

export function sortRecords<T extends Sortable & { id: string }>(
  records: readonly T[],
  key: SortKey,
  headingOf: (record: T) => string,
): T[] {
  // A copy: the caller's array is the result of a storage read and must not be
  // sorted in place.
  const out = [...records]
  switch (key) {
    case 'document':
      return out
    case 'az':
      return out.sort((a, b) => byHeading(a, b, headingOf))
    case 'za':
      return out.sort((a, b) => -byHeading(a, b, headingOf))
    case 'newest':
      return out.sort((a, b) =>
        a.updatedAt === b.updatedAt
          ? byHeading(a, b, headingOf)
          : a.updatedAt < b.updatedAt
            ? 1
            : -1,
      )
    case 'oldest':
      return out.sort((a, b) =>
        a.updatedAt === b.updatedAt
          ? byHeading(a, b, headingOf)
          : a.updatedAt < b.updatedAt
            ? -1
            : 1,
      )
  }
}

/**
 * Keep the records matching a search term.
 *
 * Every supplied field is searched, not one nominated "searchable" field, because
 * the list row shows two lines and a user searching for a year or an employer
 * expects both to be found. An empty or whitespace-only term matches everything:
 * a search box that starts by hiding everything is worse than one that ignores
 * itself until you type.
 */
export function filterRecords<T>(
  records: readonly T[],
  term: string,
  fieldsOf: (record: T) => string[],
): T[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return [...records]
  return records.filter((record) =>
    fieldsOf(record).some((field) => field.toLowerCase().includes(needle)),
  )
}
