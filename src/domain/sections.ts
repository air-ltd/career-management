/**
 * The document's sections.
 *
 * A document is a profile header, then some sections: the work history, the
 * awards and education table, the interview questions. Which of them appear, in
 * what order, and what they are called, is what a template sets (D57) — so the
 * keys live here rather than in the view, and the view asks for them by key
 * instead of deciding for itself.
 *
 * The keys are strings rather than an enum in the type system because they are
 * stored: a section's key is in the document, in the template, and in every
 * document written before a section existed. A key that is no longer understood
 * is kept and ignored rather than dropped, so a document written by a later build
 * survives a round trip through an older one (D6).
 */

/** The sections a document can be made of, in the order they appear by default. */
export const SECTION_KEYS = ['workHistory', 'awardsEducation', 'questions'] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

/**
 * The heading each section prints.
 *
 * The work history has none, and that is a decision rather than an omission: the
 * jobs begin directly under the name, and a heading saying "Work history" told
 * the reader nothing they could not see.
 */
export const DEFAULT_SECTION_HEADINGS: Record<SectionKey, string> = {
  workHistory: '',
  awardsEducation: 'Awards and Education',
  questions: 'Interview questions',
}

/**
 * The name of each section, for the screen reader and the printed document.
 *
 * Separate from the heading because a section can have no visible heading and
 * still need a name: the work history is announced as "Work history" even though
 * it prints no title.
 */
export const DEFAULT_SECTION_NAMES: Record<SectionKey, string> = {
  workHistory: 'Work history',
  awardsEducation: 'Awards and Education',
  questions: 'Interview questions',
}

/** The order the sections are in by default. */
export const DEFAULT_SECTION_ORDER: SectionKey[] = [...SECTION_KEYS]

/** The sections a document has by default: all of them. */
export const DEFAULT_SECTIONS: SectionKey[] = [...SECTION_KEYS]

/**
 * A section's heading, or the default for it.
 *
 * A section that a template names is named; one it leaves out keeps the default.
 * An empty heading is not the same as an absent one: an empty heading is a
 * section with no visible title, which is what the work history is.
 */
export function headingFor(key: string, headings: Record<string, string> | undefined): string {
  const heading = headings?.[key]
  if (heading !== undefined) return heading
  const known = DEFAULT_SECTION_HEADINGS[key as SectionKey]
  return known === undefined ? key : known
}

/** A section's name, whether or not it has a visible heading. */
export function nameFor(key: string, headings: Record<string, string> | undefined): string {
  const heading = headingFor(key, headings)
  if (heading !== '') return heading
  const known = DEFAULT_SECTION_NAMES[key as SectionKey]
  return known === undefined ? key : known
}

/**
 * The order, with any section the document does not know about left where it was.
 *
 * A document written by a later build may have a section this one has never heard
 * of. Dropping it would change the document — the order would collapse and the
 * unknown section would lose its place — so it is kept, and the view ignores keys
 * it does not know how to draw.
 */
export function resolveOrder(
  order: readonly string[] | undefined,
  known: readonly string[] = SECTION_KEYS,
): string[] {
  if (order === undefined) return [...known]
  const kept = order.filter((key) => known.includes(key))
  // A key that is not in the order at all — a section added since the order was
  // written — goes at the end, rather than being dropped.
  const missing = known.filter((key) => !kept.includes(key))
  return [...kept, ...missing]
}
