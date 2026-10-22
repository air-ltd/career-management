/**
 * Whether the phrases are offered in the app.
 *
 * The phrases are the user's own bank of reusable wording for achievements. They
 * are not in this release: the section on Work History, the disclosure in the
 * achievement form, and the two phrase routes are all off.
 *
 * The data stays. The phrases are already part of the file format (layout
 * version 2) and sync with the rest of the document, so hiding the feature must
 * not stop them being read, merged or written back: a document that already has
 * them is not damaged by a build that does not offer them, and turning this on
 * brings the feature back with the user's own phrases still in it.
 */
export const PHRASES_ENABLED = false
