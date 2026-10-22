# Security review — the release

A review of `feature/phase-5` as it stands, against the security requirements in
`specs/0001-plan.md` (§11 sync, SEC1–SEC6, D13, D26, G1) and against the
ordinary properties of the app: no untrusted text as markup, a credential that
does not travel, and a network surface that is exactly as wide as it needs to be.

**Verdict: no findings that need fixing. One thing was changed while
reviewing** — the assistant's origin was removed from the content security
policy, because the assistant is not in this release and a permission the app
does not need is a channel out of the user's document that does not have to be
closed. It is fixed and committed.

## The network surface

**SEC1 is back to two origins.** The policy permits exactly the two Dropbox
hosts:

```
connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com
```

The third origin was the assistant's provider, added in Phase 10 and used by
Phase 10's feature. The assistant is not in this release — it is behind a flag
(`src/ai/enabled.ts`) and the flag is off — so the origin has gone back out.
The feature's code is still in the bundle, so the host is still *named* there,
and the two are not the same thing:

- `scripts/check-bundle-silent.mjs` checks what the bundle **references**. It
  still allows the provider's host, because the code that names it is still
  there.
- `e2e/smoke.mjs` checks what the policy **permits**, against the served page.
  It is the two Dropbox hosts, exactly, compared against the whole list rather
  than by looking for the two names — a check that only confirmed the hosts were
  *present* would pass against `connect-src ... *`.

The gap between the two is deliberate and visible: the app cannot reach the
provider, because the policy will not let it.

**The rest of the policy is unchanged:** `default-src 'self'`,
`object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, no wildcard
anywhere, and the inline theme bootstrap covered by a hash rather than
`unsafe-inline`.

**What this costs.** The assistant's code is in the release's bundle — the
provider, the key store and the drafting panel — which is dead weight of a few
kilobytes, and it is a reviewer question. The tight end state is to delete it;
it is in the history (`git show 3ac137e^` and earlier), so deleting it is
reversible and bringing it back is too. The reason it is not deleted is that
the decision to keep it is the release's, not the review's, and the flag makes
that decision reversible in one line — with the two other places that have to
change alongside it named in `src/ai/enabled.ts` so that none of them is
forgotten.

## The credential

The provider key is the user's own, because a static site with no server cannot
hold a shared one: anything compiled into the bundle is public the moment the
site is deployed.

**It lives in the secrets store** — the same separate IndexedDB database the
Dropbox OAuth token is kept in, and for the same reason (SEC4). That database is
not the document database, so it is not synced, not exported and not backed up.
It was in `localStorage` when first written, which is the one place the app has
already decided credentials do not go; it was moved during the earlier review.

**It is not read in this release.** The key's panel is a component of its own
(`src/features/settings/AssistantKey.tsx`), and the settings page renders it
only when the assistant is enabled — so while the feature is out, the app does
not so much as read the credential.

**The key never reaches the document.** The property is tested where it lives,
in `src/storage/secretsRepo.test.ts`: the token and the provider's key are
separate names in the same store, and the store is a database of its own, not
the document's. That last part is the one that matters — a key in the document
would sync to Dropbox and be written into the files the user sends to
employers.

`scripts/check-no-bundled-secrets.mjs` scans the built bundle for
credential-shaped strings and passes, because the key is never in the bundle at
all.

**The blast radius, for when the feature returns.** A credential sitting next
to a CV means that an XSS or a malicious dependency goes from "reads your CV"
to "spends your money". SEC2 says so rather than leaving it unstated.

## Untrusted text

**No user text reaches the DOM as markup, anywhere.** There is no
`dangerouslySetInnerHTML`, no `innerHTML`, no `insertAdjacentHTML` and no
`document.write` in the source; the one occurrence of the phrase is a comment
saying it is not used. Every record the user writes is a text node or an
attribute value.

**The Markdown exporter escapes.** A line of the user's own writing that begins
with a hash is not a heading — it is a line of a CV that happens to start with
one — so it is escaped, at the start of a line and inline. The plain-text
exporter does not escape, because plain text has no markup to be read as.

**The Word export** is built from the model, not from the screen, and every
value goes into a text run rather than into markup.

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
fixed during the earlier review.*

**The estimate's links carry a record's own id.** The fit report links to the
achievements that will run long. The link was reading the wrong attribute — the
empty marker rather than the id — so every link was `#/achievements//edit` and
went nowhere. It is fixed, and the fix is tested against the attribute it reads
(`src/features/document/FitReport.test.ts`), because a test that does not fail
on the old behaviour is not a test of anything.

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
- **The assistant's code is in the bundle.** See the network surface above: the
  code is there, the permission is not.
- **The document is in the DOM on the editing pages, twice.** The editing pages
  render a copy of the document for printing, and it is laid out off the left of
  the page and hidden with `visibility` so that the estimate can be measured
  from it. The document was already in the DOM on the document page, so this
  adds a second copy of text the user wrote, in the same origin, in the same
  page — and nothing that was not already reachable is now reachable.

## What was checked, and how

| Property | Checked by |
| --- | --- |
| The policy permits exactly the two Dropbox hosts | `e2e/smoke.mjs`, against the served page |
| The bundle references no host beyond the known ones | `scripts/check-bundle-silent.mjs` |
| No credential-shaped string in the bundle | `scripts/check-no-bundled-secrets.mjs` |
| The key is in the secrets store, not the document | `src/storage/secretsRepo.test.ts` |
| The key is not read while the assistant is out | `src/features/settings/AssistantKey.tsx`, and the flag |
| No untrusted text as markup | the source, and axe over eight routes |
| The estimate's links reach the achievement | `src/features/document/FitReport.test.ts` |
| A template carries no executable content | the schema, and the review above |
| Choosing a template touches no record | `e2e/smoke.mjs` |
| The order field is type-safe | `src/domain/schemas.test.ts` |
