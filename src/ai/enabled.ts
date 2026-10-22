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
 * **One flag is not quite the whole of it.** The release's content security
 * policy permits only the two Dropbox hosts, so the provider's origin is not
 * permitted and a request to it would be blocked. That is deliberate: a
 * permission the app does not need is a channel out of the user's document that
 * does not have to be closed. So bringing the assistant back means this flag
 * *and* one line in the CSP in `vite.config.ts` *and* the host in
 * `scripts/check-bundle-silent.mjs` — three places, listed here so that none of
 * them is forgotten.
 *
 * One flag, checked in the three places the assistant is offered, so that
 * "is the assistant in this release" has a single answer rather than three
 * that have to be kept in step.
 */
export const ASSISTANT_ENABLED = false
