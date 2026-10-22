/**
 * Whether the assistant is in this release.
 *
 * The assistant drafts a line from an instruction, using a provider key of the
 * user's own. It is not in this release, so the parts of the app that offer it
 * are hidden: the drafting panel in the record forms, the key in the settings,
 * and the note about it on the About page.
 *
 * The code stays. The assistant is a feature that was built and works, and
 * hiding it is a decision about this release rather than about the code — so
 * turning this on brings it back without anything having to be written again.
 *
 * One flag, checked in the three places the assistant is offered, so that
 * "is the assistant in this release" has a single answer rather than three
 * that have to be kept in step.
 */
export const ASSISTANT_ENABLED = false
