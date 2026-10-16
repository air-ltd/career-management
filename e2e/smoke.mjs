/**
 * An end-to-end check that each object can actually be created.
 *
 * The unit tests prove the merge and the envelope are right. This proves the
 * thing the user cares about: that the forms, the router, IndexedDB and the
 * document view work together in a real browser, for every entity, without a
 * single click that does not do what its label says.
 *
 * Run against a production build:
 *   npm run build && npm run test:e2e
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium } from 'playwright'

const DIST = resolve(import.meta.dirname, '..', 'dist')

/** Must match the `base` derivation in vite.config.ts. */
const BASE_PATH = '/career-management/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
    failures.push(name)
  }
}

function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    let path = decodeURIComponent(url.pathname)

    if (!path.startsWith(BASE_PATH)) {
      response.writeHead(404).end('not found')
      return
    }
    path = path.slice(BASE_PATH.length) || 'index.html'

    const target = join(DIST, normalize(path).replace(/^(\.\.[/\\])+/, ''))
    if (!target.startsWith(DIST)) {
      response.writeHead(403).end('forbidden')
      return
    }

    const file = existsSync(target) ? target : join(DIST, '404.html')
    if (!existsSync(file)) {
      response.writeHead(404).end('not found')
      return
    }

    const body = await readFile(file)
    response.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    })
    response.end(body)
  })

  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      done({ server, origin: `http://127.0.0.1:${port}` })
    })
  })
}

/** Navigate and wait for the app to have rendered something. */
/**
 * Navigate and wait for the routed view to render.
 *
 * The hash is set in the page rather than via `goto` between routes, because a
 * hash-only change is a same-document navigation: Playwright's `goto` treats it
 * as a no-op and `networkidle` never re-fires, so the wait below would time out
 * on the second and later hops. This is also exactly what a user's click does.
 */
async function go(page, origin, hash) {
  await page.goto(`${origin}${BASE_PATH}`, { waitUntil: 'networkidle' })
  await page.evaluate((h) => {
    // `window` here is the page's, not this module's — Playwright serialises the
    // function and runs it in the browser.
    globalThis.location.hash = h
  }, hash)
  // Wait for the specific route to have rendered, not merely for the app shell.
  await page.locator('.app-main').waitFor()
  await page.locator('.app-main h2, .app-main .doc, .app-main form').first().waitFor()
}

/** Fill or select a labelled control by its visible label text. */
async function fill(page, label, value) {
  const control = page.getByLabel(label, { exact: true })
  const tag = await control.evaluate((node) => node.tagName.toLowerCase())
  if (tag === 'select') {
    await control.selectOption({ label: String(value) })
  } else {
    await control.fill(String(value))
  }
}

/**
 * Create a record through the UI and confirm it appears on the list.
 *
 * This is the assertion that matters: not that the form accepted input, but that
 * the record survived a round trip through IndexedDB and rendered again. The row
 * is matched on a value that identifies the record — its heading or a distinctive
 * fragment — not on the list's own heading.
 */
async function createAndConfirm(page, origin, { path, label, fields, expect }) {
  await go(page, origin, `${path}/new`)
  await page.getByRole('heading', { name: `Add ${label}` }).waitFor()

  for (const [field, value] of Object.entries(fields)) {
    await fill(page, field, value)
  }

  await page.getByRole('button', { name: 'Save' }).click()

  // Saving returns to the list (D10). Wait for the record's own row to appear
  // rather than for the list heading, which is on screen before the redirect and
  // would make this pass against a save that did nothing.
  const row = page.locator('.record-row').filter({ hasText: expect }).first()
  try {
    await row.waitFor({ timeout: 10000 })
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/index.html is missing. Run `npm run build` first.')
    process.exit(1)
  }

  const { server, origin } = await serve()
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    const consoleErrors = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))

    // ---------------------------------------------------------------- app loads
    const response = await page.goto(`${origin}${BASE_PATH}`, { waitUntil: 'networkidle' })
    check('the root page is served', response?.status() === 200)
    check(
      'the app rendered rather than serving a blank page',
      (await page.locator('h1').first().textContent())?.includes('Career Management Document'),
    )

    const scriptSrcs = await page
      .locator('script[src]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('src')))
    check(
      'every script is served under the base path',
      scriptSrcs.every((src) => src === null || src.startsWith(BASE_PATH)),
      JSON.stringify(scriptSrcs),
    )

    // ------------------------------------------------------------ create each
    // Order matters only in that achievements and questions need a parent.
    check(
      'a profile can be created',
      await createAndConfirm(page, origin, {
        path: '/profiles',
        label: 'profile',
        expect: 'Domestic',
        fields: { Name: 'Domestic', Title: 'Senior Engineer', Email: 'me@example.com' },
      }),
    )

    check(
      'a job can be created',
      await createAndConfirm(page, origin, {
        path: '/jobs',
        label: 'job',
        expect: 'Acme',
        fields: {
          Company: 'Acme',
          'Job title': 'Engineer',
          'Start date': '2020-01-01',
          'End date': '2024-03-31',
        },
      }),
    )

    // The achievement form's job dropdown is populated from the jobs just saved.
    // Checked by navigating to the form, not from the jobs list — which has no
    // such control, so looking for one there would pass on zero matches.
    await go(page, origin, '/achievements/new')
    const jobOption = await page
      .getByLabel('Job', { exact: true })
      .locator('option')
      .filter({ hasText: 'Acme' })
      .count()
    check('the achievement job dropdown is populated from the saved jobs', jobOption > 0)

    check(
      'an achievement can be created',
      await createAndConfirm(page, origin, {
        path: '/achievements',
        label: 'achievement',
        expect: 'Shipped the thing',
        fields: { Job: 'Acme - Engineer', Achievement: 'Shipped the thing' },
      }),
    )

    check(
      'an award can be created',
      await createAndConfirm(page, origin, {
        path: '/awards',
        label: 'award',
        expect: 'Body of Learning',
        fields: { Year: '2024', Institution: 'Body of Learning', What: 'Prize' },
      }),
    )

    check(
      'an education entry can be created',
      await createAndConfirm(page, origin, {
        path: '/education',
        label: 'education',
        expect: 'A University',
        fields: { Year: '2016', Institution: 'A University', What: 'Degree' },
      }),
    )

    check(
      'a question category can be created',
      await createAndConfirm(page, origin, {
        path: '/questions',
        label: 'question category',
        expect: 'Behavioural',
        fields: { Title: 'Behavioural' },
      }),
    )

    check(
      'a question can be created',
      await createAndConfirm(page, origin, {
        path: '/questions/all',
        label: 'question',
        expect: 'Tell me about yourself',
        fields: {
          Category: 'Behavioural',
          Question: 'Tell me about yourself',
          Answer: 'I have been building things for a long time.',
        },
      }),
    )

    // ------------------------------------------------------------- persistence
    // A reload is the real test of the storage layer: anything held only in
    // component state is gone at this point.
    await page.reload({ waitUntil: 'networkidle' })
    await go(page, origin, '/jobs')
    check(
      'records survive a reload',
      (await page.locator('.record-row').filter({ hasText: 'Acme' }).count()) > 0,
    )

    // --------------------------------------------------------------- document
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    const cvText = await page.locator('.doc').innerText()
    check('the CV document shows the profile title', cvText.includes('Senior Engineer'))
    check('the CV document shows the job', cvText.includes('Acme'))
    check('the CV document shows the achievement', cvText.includes('Shipped the thing'))
    check(
      'awards and education are combined into one table (D16)',
      cvText.includes('Body of Learning') && cvText.includes('A University'),
    )
    check(
      'the CV excludes interview questions (D37)',
      !cvText.includes('Tell me about yourself'),
    )
    check(
      'the fit report is shown for the CV preset',
      (await page.locator('.fit-report').count()) > 0,
    )

    await page.getByRole('button', { name: 'Interview preparation' }).click()
    await page.locator('.doc').waitFor()
    const interviewText = await page.locator('.doc').innerText()
    check(
      'the interview document includes questions (D37)',
      interviewText.includes('Tell me about yourself'),
    )
    check(
      'the interview document has no page target (D40)',
      (await page.locator('.fit-over').count()) === 0,
    )

    // ---------------------------------------------------------------- editing
    await go(page, origin, '/jobs')
    // The edit control is an icon link with an aria-label naming the record.
    // Targeting it by name rather than by "the first link" avoids depending on
    // how many other links a row happens to contain.
    await page
      .getByRole('link', { name: /^Edit / })
      .first()
      .click()
    await page.getByRole('heading', { name: 'Edit job' }).waitFor()
    await fill(page, 'Job title', 'Staff Engineer')
    await page.getByRole('button', { name: 'Save' }).click()
    const edited = page.locator('.record-row').filter({ hasText: 'Staff Engineer' }).first()
    const editedOk = await edited.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false,
    )
    check('an existing record can be edited', editedOk)

    // ----------------------------------------------------------------- delete
    await page
      .locator('.record-row')
      .filter({ hasText: 'Staff Engineer' })
      .first()
      .getByRole('button', { name: /Delete/ })
      .click()
    // Wait for the row to detach rather than counting straight after the click:
    // an immediate count is taken before React re-renders and would pass against
    // a delete that never happened.
    const goneFromList = await page
      .locator('.record-row')
      .filter({ hasText: 'Staff Engineer' })
      .first()
      .waitFor({ state: 'detached', timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
    check('a deleted record leaves the list', goneFromList)

    const undoShown = await page
      .locator('.undo-bar')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
    check('deleting offers an undo rather than vanishing silently', undoShown)

    await page.getByLabel('Show deleted').check()
    const stillFindable = await page
      .locator('.record-row.is-deleted')
      .filter({ hasText: 'Staff Engineer' })
      .first()
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
    check('a deleted record is still findable behind "show deleted" (D51)', stillFindable)

    // ------------------------------------------------------------ validation
    await go(page, origin, '/jobs/new')
    await page.getByRole('button', { name: 'Save' }).click()
    check(
      'a required field blocks saving and says why',
      (await page.locator('.form-error').count()) > 0,
    )

    // -------------------------------------------------------------------- sync
    // The scheduler starts with the app. With no credential it must settle as
    // "not connected" rather than reporting an expired token — a first run has
    // no token to have expired, and that message would send the user to
    // reconnect a connection that never existed.
    await go(page, origin, '/sync')
    await page.locator('.sync-page').waitFor()
    check('the sync page renders', (await page.locator('.sync-page').count()) === 1)
    check(
      'an unconnected app offers Connect',
      (await page.getByRole('button', { name: 'Connect to Dropbox' }).count()) === 1,
    )
    const indicator = await page.locator('.sync-indicator').innerText()
    check(
      'the header reports the connection state',
      /Not connected/i.test(indicator),
      indicator,
    )
    const syncErrors = await page.locator('.sync-page .form-error').count()
    check(
      'a first run reports no error',
      syncErrors === 0,
      `${String(syncErrors)} errors shown`,
    )
    check(
      'the environment shown matches the host it is served from (SY32)',
      (await page.locator('.detail-list').innerText()).includes('development'),
    )

    // ----------------------------------------------------------------- errors
    check(
      'nothing threw during the whole run',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '),
    )
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll smoke checks passed.')
}

await main()
