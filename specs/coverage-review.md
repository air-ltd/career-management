# Test coverage review — the release

A review of what the unit tests cover, what they do not, and what changed.

**Before this pass:** 92.4% of statements, 81.5% of branches, 94.5% of functions,
over 381 tests in 31 files.
**After:** 94.2% of statements, 84.4% of branches, 95.8% of functions, over 408
tests in 32 files.

The previous review took the number from 74.6% to 94.8% by writing tests for
the parts of the app that decide things — the storage, the merge, the
providers, the schemas. This pass went after what was left, and the left-overs
were not the same kind of thing.

## The number is still not the whole story

`npm run test:coverage` counts the files the tests *import*. It does not count
the files they never reach, and a file can be absent from the report for two
opposite reasons: it was never reached, or it is at 100% everywhere and the
reporter hides it. `--coverage.all` is what tells them apart, and it is what
the numbers above are from.

**44 of the 78 source files have no unit test at all.** They are almost all
React components — the editor, the document view, the rail, the settings page.
They are covered by the Playwright suite instead, which drives a real browser
against a real database, and a layout is better tested that way than by a
rendering test. The unit coverage number is a measure of the *logic*; the
application's behaviour is covered by `npm run test:e2e` and
`npm run test:a11y`.

So the number to watch is the file list, and a file that has disappeared from
it has either been fully covered or never reached.

## The finding: the Word export was losing an achievement's story

The most valuable test written in this pass found a real bug.

**An achievement's story was exported to Word as an empty paragraph.** The
story is the long version of the achievement — the prepared answer for an
interview — and it was simply not in the `.docx`.

The cause was a spread:

```ts
for (const paragraph of paragraphs(achievement.story, size, true)) {
  children.push(new Paragraph({ ...paragraph, indent: { left: 360 } }))
}
```

A `Paragraph` is an object with its runs inside it. Spreading one into another
`Paragraph` copies the properties of the object and not the runs it holds, so
the new paragraph had the indent and no text. The job's story — the same
paragraphs, pushed directly — was fine, which is why the export was not
obviously broken.

It failed quietly in the worst way: the paragraph was there, so the document
looked right. A user would have got a Word file with an empty indented line
under their achievements and no way to tell what had happened.

The fix is to make the indent a parameter of the helper rather than something
applied afterwards, so the runs are never copied. The test fails on the old
code and passes on the new — checked, not assumed.

## What else was covered, and why it was worth writing

| Area | Was | Now | Why it was worth it |
| --- | --- | --- | --- |
| `src/features/document/FitReport.tsx` | 34% | 68% | The measurement the estimate is made of, and where the broken link was. |
| `src/export/exporters/docx.ts` | 92% | 95% | The bug above. |
| `src/export/envelope.ts` | branches 85% | 85% | The message a user reads when an import fails. |
| `src/export/model.ts` | 96% | 98% | The awards and education heading when only one is in the document. |
| `src/domain/templates.ts` | branches 85% | 95% | A template from a build before the format existed. |
| `src/domain/sections.ts` | — | 100% | A section this build has never heard of. |
| `src/domain/format.ts` | — | 100% | A date that will not parse. |
| `src/domain/repair.ts` | 97% | 97% | A record the repair cannot give an id to. |
| `src/features/shared/registry.ts` | branches 58% | 63% | The categories a question's dropdown offers. |
| `src/sync/engine.ts` | 93% | 93% | The push that keeps failing, and the bound on the retries. |

**The measurement, because it is the estimate.** The report tells the user
whether what they are writing fits the page. Its tests now cover the page
count against the paper's own height, the target for each kind of document, and
the records that run long — the three things the number rests on. The link
that was broken is in the same file, and the test for it is in the same file
for that reason.

**A section this build does not know.** A document can carry a section from a
later build, kept rather than dropped (D6). The exporters leave it out rather
than printing an empty heading, and the section's name falls back to its key
rather than to nothing.

**A template from an older build.** A build that predates the format, the
section order and the headings is missing those fields. A missing field is a
document from before that field existed, and it gets the default.

**A record the repair cannot fix.** The repair gives a record with no usable id
a fresh one, so it can be edited and merged. When it cannot — the generator
fails, or hands back an id that is taken — the record is reported rather than
left silently broken.

**The push that keeps failing.** The retries are bounded, and the bound is the
point: a push that keeps being refused has to end as a failure the user is
told about. The test takes a second and a half, because the back-off is half a
second and then a second.

## What is still not covered, and why

- **The React components.** Covered by the Playwright suite rather than by unit
  tests, and the unit coverage report does not count them. This is the
  measurement flaw above, and it is the largest thing in it.
- **`useFitReport`, the hook.** The measurement is tested through
  `measureFit`; the hook that calls it is a thin wrapper around a
  `ResizeObserver`, and testing it means rendering React for the sake of a
  re-measure.
- **The retry back-off in the scheduler.** The arms and the delays, with their
  timers: five seconds, thirty seconds, two minutes. Covering it means waiting
  on real timers, and a test that waits is a test that is slow and flaky. The
  decision of *whether* to retry is covered.
- **The migration's untidy inputs** (`scripts/migrate/transform.ts`, 89%). The
  legacy data is full of half-written records, and the branches that handle
  them are the ones the committed fixture does not contain. A fixture that did
  would be a better test than a unit test.
- **The registry's field builders.** Their branches are mostly the same
  condition in several places — a field that is required, a field that is not.
  The property that matters, that the registry and the schemas agree, is
  covered.

## How to read the number now

`npm run test:coverage` is a unit-test measure. The application's behaviour is
covered by `npm run test:e2e` and `npm run test:a11y`, which drive a real
browser. Between them: 408 unit tests, the full smoke suite, and axe over eight
routes.

The number to watch is not the percentage. It is the file list — and a file
that disappears from it has either been fully covered or never reached, and the
summary says which.
