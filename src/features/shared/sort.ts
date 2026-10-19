/**
 * Filtering for the lists.
 *
 * Lives here rather than in a component because more than one surface filters, and
 * they have to agree: a search that matched in one place and not the other would
 * read as two different kinds of search.
 *
 * There is no ordering here any more. There was a selector offering "document
 * order", A-Z, Z-A and both dates, and it has gone: the list is newest-first and
 * that is not adjustable. "Document order" was not a choice between two orderings
 * anyone recognises — it was start-date-descending with a fallback to last-updated,
 * which is what the legacy app's SQL happened to produce and which nobody chose. It
 * sat at the top of the list because it was the default, which is the one position
 * where an ordering nobody can explain does the most damage.
 *
 * The order itself is in `inDocumentOrder`, shared by the editor and the lists,
 * because "newest first" is a fact about the data rather than a preference of a
 * particular screen.
 */

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
