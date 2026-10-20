# Test coverage review — `feature/phase-5`

A review of what the unit tests cover, what they do not, and what changed.

**Before:** 74.6% of statements, 67.1% of branches, 63.8% of functions, over 247
tests in 19 files.
**After:** 94.8% of statements, 83.0% of branches, 96.6% of functions, over 385
tests in 31 files.

## The first thing to know: the number was misleading

`npm run test:coverage` counts the files the tests *import*. It does not count
the files they never reach. On the branch as it stood, the whole of `src/ai/`
was absent from the report — not because it was well covered, but because
nothing imported it. The assistant, the provider and the key store were three
files of security-relevant code with no tests at all, and the report said
nothing about them.

That is a flaw in the measurement, not in the code. A file can be absent from
the report for two opposite reasons, and the text report does not say which:

- it was never reached — nothing imported it, so nothing tested it, and the
  report is silent about it;
- it is at 100% everywhere, and the reporter hides fully-covered files.

`--coverage.reporter=json-summary --coverage.reportsDirectory=/tmp/cov` tells
them apart: it lists every file, covered or not. `src/ai/chatCompletions.ts`
was in that list at 100%, and `src/ai/useDraft.ts` was not in it at all.

## What was not covered, and why it mattered

| Area | Was | Now | Why it was worth it |
| --- | --- | --- | --- |
| `src/ai/` — the provider and the key | 0% | 97% | The provider decides what leaves the device. |
| `src/features/shared/data.ts` — every write in the app | 6% | 97% | The path every change goes through. |
| `src/features/document/useTemplates.ts` | 22% | 96% | The template feature's whole behaviour. |
| `src/features/shared/registry.ts` | 15% | 98% | The contract between a form and a schema. |
| `src/storage/repository.ts` | 10% | 97% | The primitives every write uses. |
| The two text exporters | 76–78% | 97–99% | The interview document and the stories. |
| `src/sync/appKey.ts` | 33% | 100% | Which Dropbox app this origin talks to. |

## Two findings, both fixed

**The scheduler discarded a working token and blamed the wrong thing.** A
`scope-missing` failure — Dropbox rejecting the *app* for a permission it does
not have — was treated as an unusable credential, so the token was thrown away
and the user was told their sign-in had expired. The actual problem is the app's
permissions in the Dropbox App Console, and there was a message saying exactly
that, written and then unreachable: `isAuthFailure` claimed `scope-missing`
before the branch that handles it could ever run.

The token is now kept, and the user is told where to look. The branch was
uncovered code doing exactly the job it was written for.

**A comment said the opposite of what the code did.** `resolveOrder` was
documented as keeping a section it does not know about; it drops it. The
behaviour is right — the stored order keeps it, and a build that knows the
section will still find it where it was left — so the comment was corrected
rather than the code.

## The tests that were worth writing

**What the assistant sends, and what it does not.** The provider's test asserts
that the key is in a header and not in the body, that the URL is a constant and
contains nothing the user wrote, and that the body carries the instruction and
the draft and nothing else — no profile, no job, no other achievement. A test of
the *response* would have passed while any of that was wrong.

**The key is not in the document.** The key test opens the document's database
and looks for the key in every table of it. The document syncs to Dropbox and is
exported; the key is in a separate database that is neither.

**Every write announces itself.** The hooks' test writes a record *through the
app's path* and asserts a reader picks it up. It is the same test that would
have caught a write that skipped the announcement — and it is why the test
writes through `save` rather than straight to the table.

**The registry and the schemas have to agree.** The registry's test checks that
every field a form offers is one the entity's schema has. A field the schema
does not know is a field the form writes and the envelope drops, which is a
silent loss of what the user typed.

**A template cannot change who the document is for.** Applying a template writes
its settings and leaves the profile alone (D56), and the test says so.

## What is still not covered, and why

- **The React components.** The editor, the document view and the settings page
  are covered by the Playwright suite, not by unit tests. They are measured
  against a real browser with a real database, which is a better test of a
  layout than a rendering test would be — and the unit coverage report does not
  count them, which is the measurement flaw above.
- **The retry back-off in the scheduler.** The arms and the delays, with their
  timers. Covering it means waiting on real timers, and a test that waits is a
  test that is slow and flaky. The decision of *whether* to retry is covered.
- **The migration's untidy inputs** (`scripts/migrate/transform.ts`, 89%). The
  legacy data is full of half-written records, and the branches that handle them
  are the ones the committed fixture does not contain. A fixture that does would
  be a better test than a unit test.

## How to read the number now

`npm run test:coverage` is a unit-test measure. The application's behaviour is
covered by `npm run test:e2e` and `npm run test:a11y`, which drive a real
browser. Between them: 385 unit tests, the full smoke suite, and axe over eight
routes.

The number to watch is not the percentage. It is the file list — and a file that
disappears from it has either been fully covered or never reached, and the
summary says which.
