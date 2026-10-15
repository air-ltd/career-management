# Career Management Document

A career management document that runs entirely in the browser and is published
as a static GitHub Pages site. There is no server, no account, and no database
outside the browser. The document syncs to your own Dropbox app folder.

**Status: under active development.** The legacy Flask + SQLite app this
replaces is at `tmp/cv`. See [`specs/0001-plan.md`](specs/0001-plan.md) for
the design, and the phases at the bottom of it for what is and is not built yet.

## Getting started

```bash
nvm use          # reads .nvmrc, which is Node 24
npm ci
./scripts/run.sh
```

Then open <http://localhost:5173/career-management/>.

`./scripts/run.sh` passes any extra arguments through to Vite:

```bash
./scripts/run.sh --host          # listen on all interfaces
./scripts/run.sh --port 3000     # a different port
```

### Why Node 24

The base image ships Node 20, which this project cannot use: `vitest` 5 declares
`node: ^22.12.0 || ^24.0.0 || >=26.0.0` and `jsdom` 30 declares
`^22.22.2 || ^24.15.0 || >=26.0.0`. An engine error from those reads like a
dependency problem, so the run script checks the version up front and says what
is wrong.

If this is running in the devcontainer, the Node 24 feature is already declared
in `.devcontainer/devcontainer.json` — a rebuild picks it up.

## Working on it

```bash
npm run verify    # typecheck, format check, lint, secret check, citation check, test, build
npm run test      # vitest, once
npm run test:watch
npm run dev       # the Vite dev server
npm run test:e2e  # Playwright against a production build; run `npm run build` first
```

Everything is linted, formatted and type-checked on every run of `npm run verify`.
Two checks there are worth knowing about:

- **`check:secrets`** fails the build if a credential-shaped string reaches the
  bundle. The Dropbox keys in `src/sync/appKey.ts` are OAuth *client ids*, which
  are public by construction and appear in the consent screen URL. An App secret
  is a different thing and must never be here.
- **`check:citations`** fails the build if a `D1`…`D53` or `SY1`…`SY34`
  reference in source does not resolve. Renumbering a requirement in the spec
  breaks the build rather than silently orphaning the code that refers to it.

## Data

The document lives in this browser's IndexedDB and, once you connect Dropbox, in
a single file in your own Dropbox app folder:

```
/apps/<app name>/career-management-document.json
```

It is **not** encrypted by the app. Your Dropbox account is the trust boundary,
so the document is readable by anything that can read that account. See
[SEC2](specs/0001-plan.md) for what that means in practice.

## Connecting Dropbox

The app needs one Dropbox origin registered, for the deployed URL:

1. <https://www.dropbox.com/developers/apps> → **Scoped access** → **App folder**.
2. Permissions → tick `files.content.read` and `files.content.write`. Nothing else.
3. OAuth → **Redirect URIs** → add `https://air-ltd.github.io/career-management/`.
4. If you want sync to work while developing locally, also add
   `http://localhost:5173/`.

You do not need the App secret, and you should never put it in the repository.
The keys that are checked in are client ids, not credentials.

The app works without Dropbox — everything except sync.

## Repository layout

```
src/
├── app/          shell, router, theme, icons
├── domain/       merge, date formatting — pure, no I/O
├── storage/      IndexedDB via Dexie, token store
├── export/       the synchronised file format
├── sync/         provider contract, engine, scheduler, Dropbox
└── features/     profiles, jobs, achievements, awards, education,
                 questions, document, settings, sync
e2e/              Playwright smoke test against a production build
scripts/          run.sh and the CI checks
specs/            the design, as requirements
tmp/cv/           the legacy app, kept as the migration source
```

## Testing

Unit tests are in `src/**/*.test.ts(x)`, colocated with the code. The merge
engine's tests matter most: a wrong merge loses a document, and a
non-deterministic one means two devices never converge while reporting no
error at all.

The e2e smoke test exists because of one specific failure mode: a wrong base
path produces a completely green build and a completely blank page. Only a
real browser against the *servised* site catches it.
