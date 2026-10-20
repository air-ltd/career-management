# Security review — the templates, phrases, export formats and assistant work

A review of the work done on `feature/phase-5`, against the security
requirements in `specs/0001-plan.md` (§11 sync, SEC1–SEC6, D13, D26, G1) and
against the ordinary properties of the app: no untrusted text as markup, a
credential that does not travel, and a network surface that is exactly as wide
as it needs to be.

**Verdict: no findings that need fixing, and two things that were changed while
reviewing.** Both are fixed and committed.

## The network surface

**SEC1 amended from two origins to three.** The app now talks to
`https://api.openai.com` as well as the two Dropbox hosts, and the CSP
`connect-src` names exactly those three:

```
connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com https://api.openai.com
```

The provider is a **fixed origin**, not one the user configures. That is not a
limitation chosen for convenience: the policy is fixed at build time, and a
provider the user could point anywhere would need a policy that allows anywhere,
which is the one thing the policy exists to prevent. A second provider is a new
origin and a new line here, and a new module behind the same interface.

The rest of the policy is unchanged: `default-src 'self'`, `object-src 'none'`,
`base-uri 'none'`, `form-action 'none'`, no wildcard anywhere, and the inline
theme bootstrap covered by a hash rather than `unsafe-inline`.

**What the assistant sends is bounded.** The request body carries the user's
instruction and the text in the field being written. Not the profile, not the
jobs, not the other achievements, and not the document. The URL is a constant —
nothing the user writes reaches it — and the key goes in the `Authorization`
header, never in a query string, where it would end up in a log.

**`scripts/check-bundle-silent.mjs` still holds the line.** It compares the
hosts *referenced* by the built bundle against an exact list, not a subset, so a
bundle that also phoned an analytics endpoint would fail it. The list grew by
one name, deliberately.

## The credential

The provider key is the user's own, because a static site with no server cannot
hold a shared one: anything compiled into the bundle is public the moment the
site is deployed.

**It lives in the secrets store** — the same separate IndexedDB database the
Dropbox OAuth token is kept in, and for the same reason (SEC4). That database is
not the document database, so it is not synced, not exported and not backed up.
It was in `localStorage` when first written, which is the one place the app has
already decided credentials do not go; it was moved during the review.

The key is read at the moment of a request and nowhere else. It is not written
to a log — the only two `console` calls in the app are about an OAuth error, and
neither carries a token. `scripts/check-no-bundled-secrets.mjs` scans the built
bundle for credential-shaped strings and passes, because the key is never in the
bundle at all.

**The e2e suite opens the database and looks for the key in every table of it.**
That is the check that matters: a key in the document would sync to Dropbox and
be written into the files the user sends to employers.

The blast radius is wider than it was, and that is the cost of the feature rather
than a defect: a credential now sits next to a CV, so an XSS or a malicious
dependency goes from "reads your CV" to "spends your money". SEC2 now says so
rather than leaving it unstated, and the About page tells the user what is sent
and how to make the feature not exist — leave the key unset, and the panel is
not offered at all.

## Untrusted text

**No user text reaches the DOM as markup, anywhere.** There is no
`dangerouslySetInnerHTML`, no `innerHTML`, no `insertAdjacentHTML` and no
`document.write` in the source; the one occurrence of the phrase is a comment
saying it is not used.

The new surfaces are all text nodes: template names and headings, phrase text
and notes, the assistant's draft in a `value`, and the section headings.

**The Markdown exporter escapes.** A line of the user's own writing that begins
with a hash is not a heading — it is a line of a CV that happens to start with
one — so it is escaped. The plain-text exporter does not escape, because plain
text has no markup to be read as.

## The new data

**A template cannot carry anything executable (D58).** It has fields for the
page size, the type scale, the density, the format, the target, the section
order, the section list and the section headings. There is no field for a
stylesheet, and a field the schema does not know about is *kept* rather than
*interpreted* — so a template from a later build survives a round trip through
this one (D6) without giving it anything to do.

**A template cannot change who the document is for (D56).** The profile is not
one of the things a template carries, and the e2e suite checks that choosing a
template leaves the profile alone.

**The order field is type-checked.** A non-finite or non-numeric order is
refused by the schema rather than sorted with, and the comparison treats
anything that is not a finite number as absent.

**A link cannot seed a parent that is not there.** "Add an achievement under
this job" carries the job in the query, so the form starts with it filled in.
The value comes from the URL, so it is checked against the database before it is
used — otherwise a crafted link would create an achievement belonging to
nothing, which the document cannot show and the user cannot find. *Found and
fixed during the review.*

## Known and accepted

- **The array fields are not length-bounded.** A template's `sectionOrder` could
  be a very long array, which would be slow to read and slow to store. The same
  is true of every free-text field the app already has, so this is the app's
  existing posture rather than a new weakness, and bounding it would put a hard
  limit on a future build's section count.
- **The phrases are in the document, so they sync and are in the backup.** They
  are the user's own words and they are meant to follow them between devices.
  They are not in the CV: the printed document, the Word export, the Markdown
  and the plain text are all built from the document model, which has no field
  for them.
- **The third origin widens the policy.** With `connect-src` allowing the
  provider, a compromised script could exfiltrate to it. That is the same
  channel SEC1 exists to close, opened one name wide and deliberately, and the
  alternative — no assistant — was available for less.

## What was checked, and how

| Property | Checked by |
| --- | --- |
| The policy permits exactly three origins | `e2e/smoke.mjs`, against the served page |
| The bundle references no host beyond the three | `scripts/check-bundle-silent.mjs` |
| No credential-shaped string in the bundle | `scripts/check-no-bundled-secrets.mjs` |
| The key is nowhere in the document | `e2e/smoke.mjs`, opening the database |
| The key is in the secrets store, not the document | `src/ai/key.ts`, and the check above |
| No untrusted text as markup | the source, and axe over eight routes |
| A template carries no executable content | the schema, and the review above |
| Choosing a template touches no record | `e2e/smoke.mjs` |
| The order field is type-safe | `src/domain/schemas.test.ts` |
