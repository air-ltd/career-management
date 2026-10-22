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
 *
 * Some checks run inside the page (`page.evaluate`), so they legitimately reach
 * for browser globals. Those globals exist at runtime but not in this file's
 * Node environment, hence the declaration.
 */
/* global document, getComputedStyle, window */

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
  //
  // `.doc` is listed but cannot be the signal on the edit-all page: its copy of
  // the document is print-only, so it is present and permanently hidden. The
  // route's own root element is what actually distinguishes "rendered" from
  // "shell mounted".
  await page.locator('.app-main').waitFor()
  await page
    .locator('.document-page, .all-in-one, .record-list, form, .app-main h2')
    .first()
    .waitFor()
}

/**
 * The contrast ratio between a control's text and its background.
 *
 * As WCAG defines it, so the number means what it means elsewhere: 1 is
 * identical, 21 is black on white. Computed in the page, because the colours are
 * whatever the theme has resolved them to.
 */
async function contrastRatio(locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node)
    const parse = (value) => (value.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number)
    const luminance = ([r, g, b]) => {
      const channel = (value) => {
        const s = value / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const foreground = luminance(parse(style.color))
    const background = luminance(parse(style.backgroundColor))
    const lighter = Math.max(foreground, background)
    const darker = Math.min(foreground, background)
    return (lighter + 0.05) / (darker + 0.05)
  })
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
 *
 * The list's own "add" link is followed rather than the route typed in, because
 * the form sends the user back to where they came from — and a form reached by a
 * link comes back to the list, while one reached by typing does not.
 */
async function createAndConfirm(page, origin, { path, label, fields, expect }) {
  await go(page, origin, path)
  await page.getByRole('link', { name: `Add ${label}`, exact: true }).click()
  await page.locator('.record-form').waitFor()

  for (const [field, value] of Object.entries(fields)) {
    await fill(page, field, value)
  }

  await page.getByRole('button', { name: 'Save', exact: true }).click()

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

/**
 * Create a record from the all-in-one editor.
 *
 * The editor's per-section "add" link opens the same form the standalone route
 * does, with the same field labels, so the only difference is the route. Waiting
 * on the new row in the section — not on the section heading — keeps the same
 * guarantee the list-based helper had: a save that silently did nothing fails.
 */
async function createInEditor(page, origin, { section, label, fields, expect, path = '/' }) {
  await go(page, origin, path)
  await page.locator('.all-in-one').waitFor()
  /*
   * Waited on before clicked, because `.all-in-one` renders before its records
   * arrive from IndexedDB: on a cold read the section is briefly present and
   * empty, and clicking then fails on a button that is not there yet. Waiting
   * only on the container passed whenever the data happened to be warm.
   */
  // `.first()`, because "Add achievement" sits inside each job: once there is more
  // than one job the section holds several, and the strict locator would throw
  // rather than pick. The first job is a stable choice — the section is in
  // document order and the tests below only care that *a* row appears.
  const add = page
    .locator('.inline-section')
    .filter({ has: page.locator('h2', { hasText: section }) })
    .getByRole('link', { name: `Add ${label}`, exact: true })
    .first()
  await add.waitFor()
  await add.click()
  // The form is on a page of its own now, not under the row.
  await page.locator('.record-form').waitFor()

  for (const [field, value] of Object.entries(fields)) {
    await fill(page, field, value)
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page
    .locator('.all-in-one-content .inline-row')
    .filter({ hasText: expect })
    .first()
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

    /*
     * The policy, as the browser received it.
     *
     * `vite.config.ts` claims this suite asserts the served policy against its own
     * allow-list; until now it did not, so the claim was doing work the check was
     * not doing. Asserting the served text rather than the source list matters for
     * one reason: a `<meta>` policy is only honoured for content parsed *after* it,
     * so a policy emitted in the wrong place is present and inert. Reading it back
     * off the loaded page catches that, because a page whose bootstrap ran before
     * its own policy is a page the policy never covered.
     *
     * The allow-list is repeated here on purpose. A test that imported the config's
     * own array would agree with it by construction and prove nothing about either.
     */
    const csp = await page.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
      return {
        policy: meta?.getAttribute('content') ?? null,
        // Everything a policy placed after the charset has to come after the
        // bootstrap; a policy before it covers the bootstrap, which is the script
        // it exists to protect.
        policyBeforeBootstrap:
          meta === null
            ? null
            : [...document.head.children].indexOf(meta) <
              [...document.head.children].findIndex(
                (el) => el.tagName === 'SCRIPT' && !el.hasAttribute('src'),
              ),
        themeApplied: document.documentElement.dataset.theme !== undefined,
      }
    })
    check('a content security policy is served', csp.policy !== null)
    check(
      'the policy covers the theme bootstrap rather than following it',
      csp.policyBeforeBootstrap === true,
      `before=${String(csp.policyBeforeBootstrap)}`,
    )
    for (const [directive, expected] of [
      ['default-src', "'self'"],
      ['script-src', "'self'"],
      ['connect-src', 'https://api.dropboxapi.com'],
      ['connect-src', 'https://content.dropboxapi.com'],
      ['connect-src', 'https://api.openai.com'],
      ['object-src', "'none'"],
      ['base-uri', "'none'"],
      ['form-action', "'none'"],
    ]) {
      const value = (csp.policy ?? '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${directive} `))
      check(
        `the policy allows exactly what the app needs for ${directive}`,
        (value ?? '').includes(expected),
        value ?? 'absent',
      )
    }
    /*
     * The allow-list, exactly.
     *
     * Checking that the two Dropbox hosts are *present* is not enough: adding `*`
     * alongside them satisfies every such check while reopening exactly the
     * exfiltration channel the policy exists to close. So the directive is compared
     * against the whole expected set — nothing extra, nothing missing.
     */
    const directiveOf = (name) =>
      (csp.policy ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith(`${name} `))
    check(
      'connect-src names the two Dropbox hosts, the assistant, and nothing else',
      JSON.stringify(directiveOf('connect-src')) ===
        JSON.stringify([
          "connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com https://api.openai.com",
        ]),
      JSON.stringify(directiveOf('connect-src')),
    )
    check(
      'no directive opens the policy to a wildcard origin',
      !/(^|[\s;])(https?:)?\*/.test(csp.policy ?? ''),
      csp.policy ?? '',
    )
    check(
      'the policy never allows unsafe-eval',
      !(csp.policy ?? '').includes('unsafe-eval'),
      csp.policy ?? '',
    )
    check(
      'the policy never allows unsafe-inline scripts',
      !/(script-src[^;]*unsafe-inline)/.test(csp.policy ?? ''),
      (csp.policy ?? '').split(';').find((p) => p.trim().startsWith('script-src')) ?? '',
    )
    // The whole suite is worthless against a page the policy blocked, so prove the
    // app actually ran under it rather than assuming it did.
    check(
      'the app ran under the policy it served',
      csp.themeApplied && (await page.locator('h1').first().isVisible()),
    )
    check(
      'no script was refused by the policy',
      !consoleErrors.some((text) => /Content Security Policy|Refused to/i.test(text)),
      consoleErrors.filter((t) => /Content Security Policy|Refused to/i.test(t)).join(' | '),
    )
    // The deep-link fallback carries its own copy of index.html, so it needs its own
    // policy or a 404 page is served unprotected.
    const fallback = await page.goto(`${origin}${BASE_PATH}no-such-route`, {
      waitUntil: 'networkidle',
    })
    check('the deep-link fallback is served', fallback?.status() === 200)
    check(
      'the fallback carries a policy too',
      (await page.locator('meta[http-equiv="Content-Security-Policy"]').count()) === 1,
    )
    await page.goto(`${origin}${BASE_PATH}`, { waitUntil: 'networkidle' })

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
      await createInEditor(page, origin, {
        section: 'Work history',
        label: 'job',
        expect: 'Acme',
        fields: {
          Company: 'Acme',
          'Job title': 'Engineer',
          'Start date': '2020-01-01',
          'End date': '2024-03-31',
          // Present so the all-in-one page's preview has something to show.
          Responsibilities: 'Did things',
        },
      }),
    )

    // The achievement form's job dropdown is populated from the jobs just saved.
    // Checked with the form open, not from a closed page — the achievement form
    // has no standalone route any more, so it is opened from the editor.
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    await page
      .locator('.inline-section')
      .filter({ has: page.locator('h2', { hasText: 'Work history' }) })
      .getByRole('link', { name: 'Add achievement', exact: true })
      .first()
      .click()
    await page.locator('.record-form').waitFor()
    const jobOption = await page
      .getByLabel('Job', { exact: true })
      .locator('option')
      .filter({ hasText: 'Acme' })
      .count()
    check('the achievement job dropdown is populated from the saved jobs', jobOption > 0)
    const achievementLabels = await page.locator('.record-form .field > label').allInnerTexts()
    check(
      'the job link is the last thing on the achievement card',
      achievementLabels.length > 0 && achievementLabels[achievementLabels.length - 1] === 'Job',
      JSON.stringify(achievementLabels),
    )
    await page.getByRole('button', { name: 'Cancel' }).click()

    check(
      'an achievement can be created',
      await createInEditor(page, origin, {
        section: 'Work history',
        label: 'achievement',
        expect: 'Shipped the thing',
        fields: { Job: 'Acme - Engineer', Achievement: 'Shipped the thing' },
      }),
    )

    /*
     * Hiding a role's detail is the one edit that changes the document without
     * changing anything visible in the editor — the responsibilities and the
     * achievement are still there, in full, on the page where they were typed. So
     * the checks below go to the document to see what actually printed, and come
     * back to the row for the badge that is the editor's only signal.
     */
    const workHistory = page
      .locator('.inline-section')
      .filter({ has: page.locator('h2', { hasText: 'Work history' }) })
    const acmeRow = workHistory.locator('.inline-row').filter({ hasText: 'Acme' }).first()

    await acmeRow.getByRole('link', { name: 'Edit', exact: true }).click()
    await page.locator('.record-form').waitFor()
    const hideDetail = page.getByLabel(
      'Hide responsibilities and achievements from the document',
      { exact: true },
    )
    check('the job form offers to hide its detail', (await hideDetail.count()) === 1)

    const jobLabels = await page.locator('.record-form .field > label').allInnerTexts()
    check(
      'the hide option is the first thing on the job card',
      jobLabels[0] === 'Hide responsibilities and achievements from the document',
      JSON.stringify(jobLabels),
    )

    check(
      'the row does not claim to be a summary before it is one',
      (await acmeRow.locator('.badge-note').count()) === 0,
    )

    await hideDetail.check()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(700)

    check(
      'the editor says which roles print as one line',
      (await acmeRow.locator('.badge-note').count()) === 1,
    )

    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    const acmeJob = page.locator('.doc-job').filter({ hasText: 'Acme' }).first()
    check('the role itself is still in the document', (await acmeJob.count()) === 1)
    check(
      'the job is marked as a summary on the printed page',
      (await page.locator('.doc-job-summarised').count()) === 1,
    )
    // Visibility, not presence: `hasText` matches an element whether it is shown or
    // not, so counting it would pass against a paragraph that is merely hidden.
    const printedResponsibilities = page.locator('.doc-body', { hasText: 'Did things' }).first()
    const printedAchievement = page
      .locator('.doc-achievement', { hasText: 'Shipped the thing' })
      .first()
    check('its responsibilities did not print', !(await printedResponsibilities.isVisible()))
    check('its achievements did not print', !(await printedAchievement.isVisible()))
    check(
      'the header still printed, so the role is not silently missing',
      (await acmeJob.getByText('Acme', { exact: false }).count()) >= 1,
    )

    /*
     * A summary-only role does not get the expanded blank line either.
     *
     * The blank line separates a role from the next one; a role that is just a line
     * has no content to separate, so it gets none. That is the exception the format
     * change asks for, and it belongs here because this is where the summarised
     * role is made. Back to compressed afterwards, so nothing after this depends on
     * the format having been changed.
     */
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    await page.getByLabel('Whitespace', { exact: true }).selectOption('additional')
    await page.waitForTimeout(400)
    const summaryGap = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.doc-job-summarised')).marginBottom),
    )
    check('a summary-only role gets no blank line', summaryGap <= 4, `${summaryGap}px`)
    await page.getByLabel('Whitespace', { exact: true }).selectOption('compact')
    await page.waitForTimeout(400)

    // And back again, so the test does not depend on the order it runs in.
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    await acmeRow.getByRole('link', { name: 'Edit', exact: true }).click()
    await page.locator('.record-form').waitFor()
    await hideDetail.uncheck()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(700)
    check(
      'the badge goes when the detail comes back',
      (await acmeRow.locator('.badge-note').count()) === 0,
    )
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    check(
      'the detail prints again',
      await page.locator('.doc-body', { hasText: 'Did things' }).first().isVisible(),
    )

    check(
      'an award can be created',
      await createInEditor(page, origin, {
        section: 'Awards',
        label: 'award',
        expect: 'Body of Learning',
        fields: { Year: '2024', Institution: 'Body of Learning', What: 'Prize' },
      }),
    )

    check(
      'an education entry can be created',
      await createInEditor(page, origin, {
        section: 'Education',
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
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    check(
      'records survive a reload',
      (await page.locator('.inline-row').filter({ hasText: 'Acme' }).count()) > 0,
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

    /*
     * The card is the page.
     *
     * The point of the card is that the text on screen breaks where the text on
     * paper breaks, so a reader can see what the printed page will look like
     * without printing it. That holds when the measure and the type are in the
     * same proportion — the card is the page, shown larger.
     */
    const measureCard = async () =>
      page.evaluate(() => {
        const doc = document.querySelector('.doc')
        const style = getComputedStyle(doc)
        const rect = doc.getBoundingClientRect()
        // The card is shown larger than it prints, and the browser reports the
        // two differently: the computed values are the document's own, the
        // rendered ones are the scaled-up box. So the scale has to be applied to
        // the computed side to compare the two.
        const zoom = parseFloat(style.zoom) || 1
        const chrome =
          (parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            parseFloat(style.borderLeftWidth) +
            parseFloat(style.borderRightWidth)) *
          zoom
        return {
          text: rect.width - chrome,
          font: parseFloat(style.fontSize) * zoom,
          cardWidth: rect.width,
        }
      })
    const onScreen = await measureCard()
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(200)
    const onPaper = await measureCard()
    await page.emulateMedia({ media: 'screen' })
    await page.waitForTimeout(200)

    // The measure in `em` is what decides where a line ends.
    check(
      'the text on screen breaks in the same places as the text on paper',
      Math.abs(onScreen.text / onScreen.font - onPaper.text / onPaper.font) < 0.5,
      `screen ${(onScreen.text / onScreen.font).toFixed(1)}em vs paper ${(
        onPaper.text / onPaper.font
      ).toFixed(1)}em`,
    )
    check(
      'and the card is shown larger than it prints',
      onScreen.font > onPaper.font && onScreen.text > onPaper.text,
      `screen ${onScreen.font}px in ${onScreen.text.toFixed(0)}px, paper ${onPaper.font}px in ${onPaper.text.toFixed(0)}px`,
    )
    /*
     * The screen is airier than the paper.
     *
     * Reading on a screen is not reading on paper, and the card is the thing the
     * reader spends their time in. The extra leading is on the screen only; the
     * page keeps the leading the document was laid out for.
     */
    const leading = async () =>
      page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector('.doc')).lineHeight),
      )
    const screenLeading = await leading()
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(200)
    const printLeading = await leading()
    await page.emulateMedia({ media: 'screen' })
    await page.waitForTimeout(200)
    check(
      'the screen has more leading than the paper',
      screenLeading > printLeading,
      `screen ${screenLeading}px, paper ${printLeading}px`,
    )

    /*
     * And the page count is still about the paper.
     *
     * The screen's extra air must not reach the fit report: a document that
     * prints on one page must not be reported as two because the screen it was
     * measured on is airier. So the screen is given a great deal more leading and
     * the report is checked for having moved.
     */
    const reportBefore = await page.locator('.fit-report').innerText()
    // A great deal of leading, so that a report which measured the screen would
    // be counting several pages rather than the one the paper takes.
    await page.addStyleTag({ content: '.doc { line-height: 60 }' })
    await page.waitForTimeout(400)
    const reportAfter = await page.locator('.fit-report').innerText()
    check(
      'the fit report measures the paper, not the airier screen',
      reportBefore === reportAfter,
      `${reportBefore.split('\n')[0]} / ${reportAfter.split('\n')[0]}`,
    )
    // The air really was added, or the check above proves nothing.
    check(
      'and the screen really did get airier',
      (await leading()) > screenLeading * 10,
      `${await leading()}px`,
    )
    await page.evaluate(() => {
      for (const style of [...document.querySelectorAll('style')]) {
        if (style.textContent.includes('line-height: 60')) style.remove()
      }
    })
    await page.waitForTimeout(300)

    check(
      'the card fits beside the rail without a horizontal scroll',
      (await page.evaluate(() => {
        const paper = document.querySelector('.document-paper')
        return paper.scrollWidth <= paper.clientWidth
      })) === true,
    )

    // What actually prints.
    //
    // Emulated print media rather than the built-in stylesheet: this asserts what
    // the user gets on paper, which is the thing that was wrong.
    await page.emulateMedia({ media: 'print' })
    const printText = await page.locator('body').innerText()
    check(
      'the preset description does not print',
      !printText.includes('What is sent to an employer'),
      printText.slice(0, 120),
    )
    check('the preset control does not print', !printText.includes('Interview preparation'))
    check('the fit report does not print', !printText.includes('Estimated'))
    check('the include toggles do not print', !printText.includes('Also include'))
    check(
      'the print and export buttons do not print',
      !printText.includes('Print / save as PDF'),
    )
    check(
      'the navigation does not print',
      !printText.includes('Document') || !printText.includes('Settings'),
    )
    check('the document itself does print', printText.includes('Awards and Education'))
    // ------------------------------------------------------- printed layout
    // Everything below asserts something that was changed in this document pass
    // and previously had no test at all. The probes and screenshots confirmed
    // each change once, but nothing here would fail if one regressed.
    //
    // A second job first: the rules being checked are about what happens
    // *between* jobs, and one job cannot show that.
    //
    // Back to screen media to do it: the stylesheet hides every button when
    // printing, so the form's Save cannot be clicked from under emulated print.
    await page.emulateMedia({ media: 'screen' })
    await createInEditor(page, origin, {
      section: 'Work history',
      label: 'job',
      expect: 'Globex',
      fields: {
        Company: 'Globex',
        'Job title': 'Warehouse Lead',
        'Start date': '2015-01-01',
        'End date': '2018-12-31',
        Responsibilities: 'Ran the warehouse team.',
      },
    })
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    await page.emulateMedia({ media: 'print' })

    const pageRuleText =
      (await page.locator('style[data-page-rule]').first().textContent()) ?? ''
    check(
      // Matched to the legacy document's 10.58mm, so the line of measure is the same
      // width the CVs this replaces were set at. The generator emits the shorthand
      // for all four sides, which is the form it collapses to when they are equal;
      // the long form is accepted too so this does not fail on a change that varies
      // one side.
      'the page margin matches the legacy document at 10.5mm on every side',
      /margin:\s*10\.5mm(\s+10\.5mm){0,3}\s*;/.test(pageRuleText),
      pageRuleText,
    )

    // The heading was removed, but the section keeps its accessible name, so the
    // structure is still announced. Nothing is drawn, though.
    check(
      'the Work history heading is not drawn, but the section is still named',
      !printText.includes('Work history') &&
        (await page.locator('section[aria-label="Work history"]').count()) === 1,
    )

    const jobs = page.locator('.doc-job')
    check('both jobs are on the document', (await jobs.count()) === 2, `${await jobs.count()}`)

    const jobGap = await jobs.evaluateAll((els) => {
      if (els.length < 2) return null
      const a = els[0].getBoundingClientRect()
      const b = els[1].getBoundingClientRect()
      return {
        gap: b.top - a.bottom,
        borders: els.map((el) => {
          const s = getComputedStyle(el)
          return [s.borderTopWidth, s.borderBottomWidth, s.boxShadow, s.backgroundColor]
        }),
      }
    })
    if (jobGap) {
      check(
        'consecutive jobs have no space between them',
        jobGap.gap <= 1,
        `${jobGap.gap.toFixed(1)}px`,
      )
      check(
        'jobs are not separated by a rule',
        jobGap.borders.every((b) => parseFloat(b[0]) === 0 && parseFloat(b[1]) === 0),
        JSON.stringify(jobGap.borders),
      )
    }

    // Single spacing, so the block does not open up on paper.
    const spacing = await page.evaluate(() => {
      const body = document.querySelector('.doc-body')
      const li = document.querySelector('.doc-achievements li')
      const ratio = (el) => {
        if (!el) return null
        const s = getComputedStyle(el)
        return parseFloat(s.lineHeight) / parseFloat(s.fontSize)
      }
      return { body: ratio(body), achievement: ratio(li) }
    })
    check(
      'responsibilities are single spaced',
      spacing.body !== null && spacing.body < 1.3,
      `${spacing.body}`,
    )
    check(
      'achievements are single spaced',
      spacing.achievement !== null && spacing.achievement < 1.3,
      `${spacing.achievement}`,
    )

    // The awards table: rules off, columns fixed, institution narrow.
    const table = await page.locator('.doc-award-table').evaluate((t) => {
      const cells = [...t.querySelectorAll('td')]
      const institution = t.querySelector('.doc-award-institution')
      return {
        borders: cells.flatMap((c) => {
          const s = getComputedStyle(c)
          return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth]
        }),
        layout: getComputedStyle(t).tableLayout,
        institutionShare:
          (institution.getBoundingClientRect().width / t.getBoundingClientRect().width) * 100,
      }
    })
    check(
      'the awards table has no cell borders',
      table.borders.every((w) => parseFloat(w) === 0),
      JSON.stringify(table.borders.slice(0, 8)),
    )
    check('the awards table uses fixed layout', table.layout === 'fixed', table.layout)
    check(
      'the awards table gives the institution a narrow column',
      Math.abs(table.institutionShare - 34) < 1.5,
      `${table.institutionShare.toFixed(1)}%`,
    )

    // The ink of the document's structure, against its body text.
    const luminance = (rgb) => {
      const [r, g, b] = rgb
        .match(/\d+/g)
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const c = v / 255
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    const ink = await page.evaluate(() => {
      const colour = (sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el).color : null
      }
      return {
        title: colour('.doc-title'),
        sectionTitle: colour('.doc-section-title'),
        dates: colour('.doc-job-dates'),
        jobTitle: colour('.doc-job-title'),
        body: colour('.doc'),
      }
    })
    check(
      'the document headings and job headers are pure black',
      [ink.title, ink.sectionTitle, ink.dates, ink.jobTitle].every((c) => c === 'rgb(0, 0, 0)'),
      JSON.stringify(ink),
    )

    /*
     * "Softer" is measured rather than asserted as "not black".
     *
     * The first version of this check only required the body not be black, which a
     * body set to `#1a1a18` — grey enough to pass, and too light on paper — satisfied
     * just as well as the right value. Comparing luminance against the headings
     * catches both directions: body gone the same black as the structure, and body
     * pulled back towards grey.
     */
    check(
      'the body text is measurably lighter than the headings',
      ink.body !== null && luminance(ink.body) > luminance('rgb(0, 0, 0)') + 0.004,
      `${ink.body}`,
    )

    /*
     * The contact details are body text, not a caption under the name, and the
     * achievements are the reference for what body text looks like here — so the
     * check is expressed as agreement with the achievements rather than as a
     * literal colour, and will not need editing when the body's ink moves again.
     */
    const contactVsAchievement = await page.evaluate(() => {
      const inkOf = (sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el).color : null
      }
      return { contact: inkOf('.doc-contact'), achievement: inkOf('.doc-achievement') }
    })
    check(
      'the contact details are the same colour as the achievements',
      contactVsAchievement.contact !== null &&
        contactVsAchievement.contact === contactVsAchievement.achievement,
      JSON.stringify(contactVsAchievement),
    )
    /*
     * Every check above ran in the light theme, and that is exactly how the
     * structural inks came to be hardcoded to black: right on white paper,
     * invisible on the dark theme's own surface, where the document measures
     * rgb(31, 31, 36). Nothing failed, because nothing looked.
     *
     * So the invariant is asserted in both themes, and as a contrast ratio rather
     * than a literal colour: a hardcoded expectation would need replacing the next
     * time a theme value moves, and this one holds whatever the ink is.
     */
    const readContrast = () =>
      page.evaluate(() => {
        const lum = (rgb) => {
          const [r, g, b] = rgb
            .match(/\d+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const c = v / 255
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const ratio = (a, b) => {
          const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
          return (hi + 0.05) / (lo + 0.05)
        }
        const doc = document.querySelector('.doc')
        const surface = getComputedStyle(doc).backgroundColor
        const pick = (sel) => {
          const el = document.querySelector(sel)
          return el ? ratio(getComputedStyle(el).color, surface) : null
        }
        return {
          surface,
          heading: pick('.doc-title'),
          job: pick('.doc-job-title'),
          body: pick('.doc-body') ?? ratio(getComputedStyle(doc).color, surface),
        }
      })

    const legible = (c) => [c.heading, c.job, c.body].every((r) => r !== null && r >= 4.5)
    const lightContrast = await readContrast()
    check(
      'every level of document ink is legible in the light theme',
      legible(lightContrast),
      JSON.stringify(lightContrast),
    )
    /*
     * Switch theme through the real control rather than by writing the attribute,
     * so the check cannot pass against a theme the app would never actually apply.
     *
     * Every measurement below is taken under emulated *print*, which is the point:
     * the document's appearance on paper must not depend on the theme on screen.
     */
    const screenTitleInk = async () => {
      await page.emulateMedia({ media: 'screen' })
      const ink = await page.evaluate(
        () => getComputedStyle(document.querySelector('.doc-title')).color,
      )
      await page.emulateMedia({ media: 'print' })
      return ink
    }
    const setTheme = async (theme) => {
      await page.emulateMedia({ media: 'screen' })
      await go(page, origin, '/settings')
      await page.getByLabel('Theme').selectOption(theme)
      await go(page, origin, '/document')
      await page.locator('.doc').waitFor()
      await page.emulateMedia({ media: 'print' })
    }

    // Read off the screen, because print is deliberately identical between the
    // themes and so cannot tell us whether dark was ever applied. Without this the
    // dark checks below would pass just as happily against the light theme.
    const screenInk = { light: await screenTitleInk() }
    await setTheme('dark')
    screenInk.dark = await screenTitleInk()

    check(
      'the themes really do differ on screen, so the dark check was not a repeat',
      screenInk.light === 'rgb(0, 0, 0)' && screenInk.dark === 'rgb(255, 255, 255)',
      JSON.stringify(screenInk),
    )

    const darkContrast = await readContrast()
    check(
      'every level of document ink is legible in the dark theme',
      legible(darkContrast),
      JSON.stringify(darkContrast),
    )

    /*
     * Printing is not themed, and this needs its own check rather than riding on
     * the contrast one above: the broken output was near-white text on a near-black
     * panel, which is a *high* contrast ratio and passes the legibility check
     * comfortably. Legible and correct are different questions here — the printed
     * document has to be the paper one.
     */
    check(
      'the printed document is the paper one, from the dark theme as well',
      darkContrast.surface === 'rgb(255, 255, 255)' &&
        lightContrast.surface === 'rgb(255, 255, 255)',
      `light ${lightContrast.surface}, dark ${darkContrast.surface}`,
    )

    await go(page, origin, '/settings')
    await page.getByLabel('Theme').selectOption('light')
    // Back to the document, because that is where the next check starts and it
    // reaches for the preset control by label.
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()

    await page.emulateMedia({ media: 'screen' })

    await page.getByLabel('Template', { exact: true }).selectOption('interview')
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
    // On the profiles list: jobs have no list of their own any more, and this is
    // about the list-to-edit-route path, not about jobs.
    await go(page, origin, '/profiles')
    // Scoped to the record row: the navigation contains links whose names also
    // begin "Edit", and DOM order would pick one of those instead of this one.
    await page
      .locator('.record-row')
      .filter({ hasText: 'Domestic' })
      .first()
      .getByRole('link', { name: /^Edit / })
      .click()
    await page.getByRole('heading', { name: 'Edit profile' }).waitFor()
    await fill(page, 'Email', 'edited@example.com')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const edited = page.locator('.record-row').filter({ hasText: 'edited@example.com' }).first()
    const editedOk = await edited.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false,
    )
    check('an existing record can be edited', editedOk)

    // ------------------------------------------------------------ validation
    await go(page, origin, '/profiles/new')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    check(
      'a required field blocks saving and says why',
      (await page.locator('.form-error').count()) > 0,
    )

    // ------------------------------------------------------------- all in one
    // The single-page editor: every section on one page, one row per record.
    // Reached at the root, because it is the default page.
    await page.goto(`${origin}${BASE_PATH}`, { waitUntil: 'networkidle' })
    await page.locator('.all-in-one').waitFor()
    check(
      'the root URL is the all-in-one editor',
      (await page.locator('.all-in-one').count()) === 1,
    )
    check(
      'the header names the environment when it is not production (SY33)',
      (await page.locator('.app-header .env-badge').innerText()).toLowerCase() ===
        'development',
    )

    await go(page, origin, '/edit')
    await page.locator('.all-in-one').waitFor()
    const sections = await page.locator('.inline-section h2').allInnerTexts()
    check(
      'the edit-all page shows the career sections',
      ['Profiles', 'Work history', 'Awards', 'Education'].every((name) =>
        sections.includes(name),
      ),
      JSON.stringify(sections),
    )
    check(
      'the questions have their own page, not a section of the edit-all page',
      !sections.includes('Question categories'),
      JSON.stringify(sections),
    )

    // The other half of the split, and the reason it was worth doing: the questions
    // were last on a page long enough that they sat below the fold.
    await go(page, origin, '/interview')
    await page.locator('.questions-page').waitFor()
    const questionSections = await page.locator('.inline-section h2').allInnerTexts()
    check(
      'the questions page shows the question categories and nothing else',
      questionSections.length === 1 && questionSections[0] === 'Question categories',
      JSON.stringify(questionSections),
    )
    check(
      'the career sections are not repeated on the questions page',
      !questionSections.some((name) => ['Work history', 'Awards', 'Education'].includes(name)),
      JSON.stringify(questionSections),
    )
    // Reachable both ways without typing a route, or the second page has no way in.
    check(
      'the questions page links back to the career content',
      (await page.locator('.page-cross-link a[href="#/"]').count()) === 1,
    )
    await go(page, origin, '/edit')
    await page.locator('.all-in-one').waitFor()
    check(
      'the career page links on to the questions',
      (await page.locator('.page-cross-link a[href="#/interview"]').count()) === 1,
    )
    check(
      'the page opens no form at all',
      (await page.locator('.record-form').count()) === 0,
      'a form belongs on a page of its own',
    )
    check(
      'achievements are grouped under their job',
      (await page.locator('.inline-children').count()) > 0,
    )
    check(
      'no achievement or question counts are shown',
      (await page.locator('.inline-children-label').count()) === 0,
    )
    /*
     * The same rule for a category, run on the page the categories are on.
     *
     * This used to run here, on the edit-all page, and it was already close to
     * vacuous: the category was the only thing it looked for, so a locator
     * matching nothing at all would pass it. The split made it entirely so — the
     * category is on the questions page now, so this found nothing every time.
     * A check that cannot see its subject cannot fail, so it says which row it
     * measured instead.
     */
    await go(page, origin, '/interview')
    await page.locator('.questions-page').waitFor()
    check(
      'a category lists its questions beneath it',
      (await page
        .locator('.inline-row-group')
        .filter({ hasText: 'Behavioural' })
        .first()
        .locator('.inline-children > .inline-row')
        .count()) === 1,
    )
    /*
     * The rule this replaced: a parent with no children renders no box at all.
     *
     * Written against every box on the page rather than against one parent,
     * because the version before it asked a row for its own children -- and the
     * children are a *sibling* of the row, under a shared `.inline-row-group`. So
     * that lookup found nothing however the code behaved, and the check had passed
     * for as long as it existed without ever looking at anything. Asserting that no
     * empty box is rendered catches the thing the rule is actually about.
     */
    const emptyChildBoxes = await page
      .locator('.inline-children')
      .evaluateAll((els) => els.filter((el) => el.querySelector('.inline-row') === null).length)
    check(
      'a parent with no children shows no empty-state box at all',
      emptyChildBoxes === 0,
      `${emptyChildBoxes} empty boxes`,
    )
    await go(page, origin, '/edit')
    await page.locator('.all-in-one').waitFor()

    const jobRow = page.locator('.inline-row').filter({ hasText: 'Acme' }).first()
    check(
      'the job responsibilities are readable without opening the record',
      (await jobRow.locator('.inline-row-preview').innerText()).includes('Did things'),
    )
    check(
      '"add achievement" sits beside the job Edit button',
      (await jobRow.getByRole('link', { name: 'Add achievement' }).count()) === 1 &&
        (await jobRow.getByRole('link', { name: 'Edit' }).count()) === 1,
    )

    // Adding a nested record from beside the parent button. The link opens the
    // form on a page of its own, with the job already filled in.
    await jobRow.getByRole('link', { name: 'Add achievement' }).click()
    await page.getByRole('heading', { name: 'Add achievement' }).waitFor()
    check(
      'the add form arrives with the parent already filled in',
      (await page.getByLabel('Job', { exact: true }).inputValue()) !== '',
    )
    await page.getByLabel('Achievement', { exact: true }).fill('NESTED_FROM_PARENT')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page
      .locator('.inline-row-heading')
      .filter({ hasText: 'NESTED_FROM_PARENT' })
      .first()
      .waitFor({ timeout: 10000 })
    check('a nested record can be added from beside its parent', true)
    // The bug this caught: the nested add form is pre-filled with its parent, so
    // it looked like an existing record and saved under an empty id.
    check(
      'the add form is titled Add, not Edit',
      (await page.getByRole('heading', { name: 'Add achievement' }).count()) === 0 ||
        (
          await page.getByRole('heading', { name: 'Add achievement' }).first().innerText()
        ).startsWith('Add'),
    )
    // The row carries its id as an attribute, which is the same value the record
    // was saved under, so this still catches an empty id.
    const nestedId = await page
      .locator('.all-in-one-content .inline-row')
      .filter({ hasText: 'NESTED_FROM_PARENT' })
      .first()
      .getAttribute('data-record-id')
    check(
      'a nested record added in place gets a real id, not an empty one',
      nestedId !== null && nestedId !== '',
      String(nestedId),
    )

    // Editing in place, and the change reaching the record.
    await go(page, origin, '/')
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Acme' })
      .first()
      .getByRole('link', { name: 'Edit' })
      .click()
    await page.getByRole('heading', { name: 'Edit job' }).waitFor()
    await fill(page, 'Job title', 'Principal Engineer')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page
      .locator('.inline-row-heading')
      .filter({ hasText: 'Principal Engineer' })
      .first()
      .waitFor({ timeout: 10000 })
    check('a record can be edited from the all-in-one page', true)

    // Adding from the all-in-one page reaches the separate list view too.
    const awardsSection = page.locator('.inline-section').filter({ hasText: 'Awards' })
    await awardsSection.getByRole('link', { name: /Add award/ }).click()
    await page.getByRole('heading', { name: 'Add award' }).waitFor()
    await fill(page, 'Year', '2011')
    await fill(page, 'Institution', 'Institute of Something')
    await fill(page, 'What', 'Fellowship')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    // The form is a page of its own, so saving leaves it; waiting for the form
    // to go is what proves the save ran, rather than navigating away mid-write
    // and finding nothing there.
    await page
      .locator('.record-form')
      .waitFor({ state: 'detached', timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
      .then((closed) => {
        check('saving leaves the form and goes back to the page it came from', closed)
      })

    // The award's own route is gone, so "it reached the document" is the check:
    // the record has to be findable somewhere once it is saved, and the document
    // is where a saved record has to end up working.
    await go(page, origin, '/document')
    await page.locator('.doc-award-table').waitFor()
    check(
      'a record added on the all-in-one page reaches the document',
      (await page.locator('.doc-award-table').innerText()).includes('Institute of Something'),
    )

    // Print / save as PDF, offered here so the document can be printed from the
    // page the user is editing on.
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    // In the rail, not the toolbar: it belongs with the other document controls.
    const printInRail = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Print / save as PDF'),
      )
      const rail = document.querySelector('.document-sidebar')
      const box = button === null ? null : button.getBoundingClientRect()
      return {
        count: document.querySelectorAll('.document-actions > button').length,
        inRail: rail !== null && rail.contains(button),
        onScreen: box !== null && box.top >= 0 && box.bottom <= window.innerHeight,
      }
    })
    check(
      'the edit-all page offers print, first in the rail and on screen',
      printInRail.count === 1 && printInRail.inRail && printInRail.onScreen,
      JSON.stringify(printInRail),
    )
    check(
      'print is the first thing in the rail',
      (await page.evaluate(() => {
        const first = document.querySelector('.document-sidebar > *')
        return first !== null && first.classList.contains('document-actions')
      })) === true,
    )
    // A select, like the profile picker: the rail is a list of settings, not a
    // list of things of two kinds.
    check(
      'the preset choice is a select in the rail, not above the document',
      (await page.evaluate(() => {
        const rail = document.querySelector('.document-sidebar')
        const control = document.querySelector('#document-preset')
        return (
          rail !== null &&
          control !== null &&
          control.tagName === 'SELECT' &&
          rail.contains(control) &&
          document.querySelector('.document-toolbar') === null
        )
      })) === true,
    )
    // Open to begin with: closed, the card gives away nothing and the fit report
    // below quietly contradicts it.
    check(
      'the content card holds the include options, open and named',
      (await page.evaluate(() => {
        const card = document.querySelector('.document-content')
        return (
          card !== null &&
          card.querySelector('.document-content-title')?.textContent?.trim() === 'Content' &&
          card.querySelectorAll('.document-includes input[type=checkbox]').length === 6
        )
      })) === true,
    )
    // The heading and the explanatory paragraph are gone: this page is the
    // document, and the controls beside it already say which document.
    const editAllText = await page.locator('.all-in-one').innerText()
    check(
      'the edit-all page has no "Edit everything" heading',
      !(await page.locator('.all-in-one h2').allInnerTexts()).includes('Edit everything'),
      await page.locator('.all-in-one h2').allInnerTexts(),
    )
    check(
      'the edit-all page has no explanatory paragraph',
      !editAllText.includes('The whole document on one page'),
      editAllText.slice(0, 80),
    )

    // Every record stacked in the one column beside the sidebar. Left to itself
    // each section is a grid item, and a grid fills its columns before it starts a
    // new row — so they alternated across the page, half of them sitting under
    // the sidebar.
    const stacked = await page.evaluate(() => {
      const sections = [...document.querySelectorAll('.all-in-one-content > .inline-section')]
      const boxes = sections.map((s) => s.getBoundingClientRect())
      const sidebar = document.querySelector('.document-controls').getBoundingClientRect()
      return {
        count: boxes.length,
        oneColumn: new Set(boxes.map((b) => Math.round(b.left))).size === 1,
        descending: boxes.every((b, i) => i === 0 || b.top >= boxes[i - 1].bottom - 1),
        clearOfRail: boxes.every((b) => b.right <= sidebar.left),
      }
    })
    check(
      'every record section stacks in the column beside the sidebar',
      stacked.count > 1 && stacked.oneColumn && stacked.descending && stacked.clearOfRail,
      JSON.stringify(stacked),
    )

    // Identical chrome to the document page: same presets, same profile picker,
    // same toggles, in the same places. Two copies of this would drift, and the
    // symptom is a print button that gives a different document depending on
    // which page you pressed it from.
    const chrome = async () => {
      await go(page, origin, '/')
      await page.locator('.all-in-one').waitFor()
      return page.evaluate(() => ({
        rail: [...document.querySelectorAll('.document-sidebar > *')].map(
          (c) => c.className.split(' ')[0],
        ),
        alsoIncludeOpen: document.querySelector('.document-content') !== null,
        presets: [...document.querySelectorAll('#document-preset option')].map((o) =>
          o.textContent.trim(),
        ),
        toggles: [
          ...document.querySelectorAll('.document-sidebar .document-includes label'),
        ].map((l) => l.textContent.trim()),
        profile: document.querySelector('.document-sidebar #document-profile') !== null,
        railRight: (() => {
          const rail = document.querySelector('.document-controls').getBoundingClientRect()
          const content = document.querySelector('.all-in-one-content').getBoundingClientRect()
          return content.right <= rail.left + 1
        })(),
      }))
    }
    const editAllChrome = await chrome()
    await go(page, origin, '/document')
    await page.locator('.document-page').waitFor()
    const documentChrome = await page.evaluate(() => ({
      rail: [...document.querySelectorAll('.document-sidebar > *')].map(
        (c) => c.className.split(' ')[0],
      ),
      presets: [...document.querySelectorAll('#document-preset option')].map((o) =>
        o.textContent.trim(),
      ),
      toggles: [...document.querySelectorAll('.document-sidebar .document-includes label')].map(
        (l) => l.textContent.trim(),
      ),
      profile: document.querySelector('.document-sidebar #document-profile') !== null,
      alsoIncludeOpen: document.querySelector('.document-content') !== null,
      railRight: (() => {
        const rail = document.querySelector('.document-controls').getBoundingClientRect()
        const paper = document.querySelector('.document-paper').getBoundingClientRect()
        return paper.right <= rail.left + 1
      })(),
    }))
    check(
      'the edit-all and document pages offer the same controls in the same order',
      JSON.stringify(editAllChrome.presets) === JSON.stringify(documentChrome.presets) &&
        JSON.stringify(editAllChrome.toggles) === JSON.stringify(documentChrome.toggles) &&
        editAllChrome.profile === documentChrome.profile &&
        editAllChrome.alsoIncludeOpen === documentChrome.alsoIncludeOpen &&
        // The fit report is the document page's alone: it measures a rendered
        // document, and the edit page has nothing on screen to measure.
        JSON.stringify(editAllChrome.rail) ===
          JSON.stringify(documentChrome.rail.filter((c) => c !== 'fit-report')),
      `edit-all ${JSON.stringify(editAllChrome)} vs document ${JSON.stringify(documentChrome)}`,
    )
    check(
      'both pages put the controls in a right-hand rail beside the content',
      editAllChrome.railRight === true && documentChrome.railRight === true,
      `${editAllChrome.railRight} / ${documentChrome.railRight}`,
    )
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()

    // It offers the same controls as the document page, because it prints the
    // same document: a print that ignored them would disagree with the document
    // page while claiming to be the same button.
    check(
      'the edit-all page offers the same include toggles',
      // Scoped to the include options, as the comparison with the document page
      // is: the rail holds other checkboxes now, and those are not include
      // toggles.
      (await page.locator('.all-in-one .document-includes input[type=checkbox]').count()) === 6,
    )
    check(
      'the edit-all page offers the document presets',
      (await page.locator('.all-in-one #document-preset option').count()) >= 2,
    )
    const editAllOnScreen = await page.evaluate(
      () => getComputedStyle(document.querySelector('.all-in-one-print')).display,
    )
    check(
      'the printed document is not also shown on screen',
      editAllOnScreen === 'none',
      editAllOnScreen,
    )
    await page.emulateMedia({ media: 'print' })
    const editAllPrint = await page.evaluate(() => {
      const display = (selector) => {
        const element = document.querySelector(selector)
        return element === null ? 'missing' : getComputedStyle(element).display
      }
      return {
        document: display('.all-in-one-print'),
        doc: display('.all-in-one-print .doc'),
        // The records are the editor, not the output.
        records: display('.inline-section'),
        rail: display('.all-in-one .document-controls'),
      }
    })
    check(
      'printing the edit-all page prints the document, not the editor',
      editAllPrint.document === 'block' &&
        editAllPrint.doc === 'block' &&
        editAllPrint.records === 'none' &&
        editAllPrint.rail === 'none',
      JSON.stringify(editAllPrint),
    )
    // The formatted layout, not the record list: the document's own header and
    // section headings are what distinguish the two.
    const printed = await page.evaluate(() => {
      const doc = document.querySelector('.all-in-one-print .doc')
      return {
        sections: doc.querySelectorAll('.doc-section-title').length,
        hasHeader: doc.querySelector('.doc-header') !== null,
        // The editor's own rows are the thing being ruled out.
        editorRows: doc.querySelectorAll('.record-row').length,
      }
    })
    /*
     * The two print buttons must produce the same page.
     *
     * Compared as text, all of it, rather than by the presence of particular
     * elements: an earlier version of this area checked that the editor's records
     * were absent, which passed while the print still carried a stray search box and
     * a list of sort orders, because those are not records. The reported symptom was
     * "extra artifacts at the end of the document" and this is the check that would
     * have caught it.
     *
     * The comparison is what makes the stylesheet rule maintainable. `display: none`
     * on a hand-picked list of editor classes loses to the next control anyone adds;
     * comparing what actually prints does not, because anything new that leaks shows
     * up here rather than in someone's PDF.
     */
    const printTextOf = async (route) => {
      await go(page, origin, route)
      await page.emulateMedia({ media: 'print' })
      const text = await page.locator('body').innerText()
      await page.emulateMedia({ media: 'screen' })
      return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    }
    /*
     * The document's typeface.
     *
     * Asserted because it failed silently once already: the document inherited the
     * application's sans stack, so printing produced a CV in the wrong face with
     * nothing to indicate it had. The page looked correct on screen precisely because
     * it agreed with itself.
     *
     * Checked on the rendered element rather than in the stylesheet, since what
     * matters is the font the document actually resolved to. The application chrome
     * is asserted to still be the sans it is meant to be, so this cannot be satisfied
     * by changing everything.
     */
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    const fonts = await page.evaluate(() => ({
      document: getComputedStyle(document.querySelector('.doc')).fontFamily,
      chrome: getComputedStyle(document.querySelector('.app-header')).fontFamily,
    }))
    check(
      'the document is set in Times New Roman, not the interface sans',
      /times/i.test(fonts.document) && !/system-ui|-apple-system/i.test(fonts.document),
      fonts.document,
    )
    check(
      'the interface keeps its own sans, so the check above is not satisfied by changing everything',
      /system-ui|-apple-system/i.test(fonts.chrome),
      fonts.chrome,
    )

    const printedFromDocument = await printTextOf('/document')
    const printedFromEditAll = await printTextOf('/')
    const firstDifference = printedFromDocument.find(
      (line, index) => line !== printedFromEditAll[index],
    )
    check(
      'printing from the work history page gives the same document as printing from the document page',
      JSON.stringify(printedFromEditAll) === JSON.stringify(printedFromDocument),
      firstDifference === undefined
        ? `${printedFromDocument.length} lines each`
        : `first difference: document has ${JSON.stringify(firstDifference)}, work history has ${JSON.stringify(
            printedFromEditAll[printedFromDocument.indexOf(firstDifference)],
          )}`,
    )
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()

    check(
      'the printed output is the formatted document',
      printed.hasHeader && printed.sections > 0 && printed.editorRows === 0,
      JSON.stringify(printed),
    )
    await page.emulateMedia({ media: 'screen' })

    // ----------------------------------------------------------------- delete
    // After the all-in-one checks, which need this job alive: deleted records are
    // no longer listed there by default.
    /*
     * Keyboard-only use of the disclosure that every edit goes through.
     *
     * Asserted by pressing Tab rather than by calling `.focus()`: the question is
     * not whether something in the form can take focus, it is whether a user who
     * never touches a mouse lands in the form, which is what Tab from the toggle
     * is.
     */
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    const firstRowToggle = page.locator('.inline-row-toggle').first()
    await firstRowToggle.focus()
    const landedIn = async () =>
      page.evaluate(() => {
        const active = document.activeElement
        if (active === null) return 'none'
        return active.closest('.record-form') === null ? 'outside the form' : 'inside the form'
      })
    /*
     * One search box and one order, for the whole page.
     *
     * The claim worth making is that it spans every section: a search that filtered
     * jobs but not awards would pass a check written against jobs, which is how it
     * usually goes wrong.
     */
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    const sectionRows = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.inline-section')].map((section) => ({
          name: section.querySelector('h2')?.textContent ?? '',
          // A section's own rows only: a nested achievement belongs to its job, so
          // counting it here would make the two totals incomparable.
          rows: section.querySelectorAll(':scope > .inline-rows > .inline-row-group').length,
        })),
      )
    const before = await sectionRows()

    // A term taken from a job, so "the sections that match" is knowable rather than
    // assumed: work history keeps a row and every other section empties.
    await page.getByLabel('Search', { exact: true }).fill('Acme')
    await page.waitForTimeout(300)
    const after = await sectionRows()
    const emptied = after.filter(
      (section, index) => section.rows === 0 && before[index].rows > 0,
    )
    check(
      'search narrows the section that matches and empties every other one',
      after.find((section) => section.name === 'Work history').rows === 1 &&
        emptied.length >= 1 &&
        after.every((section) => section.name === 'Work history' || section.rows === 0),
      `before ${JSON.stringify(before)} / after ${JSON.stringify(after)}`,
    )
    check(
      'the search box is the only one on the page, so it reads as covering all of it',
      (await page.getByLabel('Search', { exact: true }).count()) === 1,
    )

    await page.getByLabel('Search', { exact: true }).fill('')
    await page.waitForTimeout(300)
    check(
      'clearing the search brings every record back',
      JSON.stringify(await sectionRows()) === JSON.stringify(before),
      `before ${JSON.stringify(before)}`,
    )

    /*
     * The list order, now that there is no control for it.
     *
     * Was: A-Z and Z-A of a dropdown. Now: newest first, fixed. The check is on the
     * order rather than on the absence of a widget, because "the selector is gone" is
     * a thing undone by adding a selector back, and "the jobs come out newest first"
     * is the claim a user actually has.
     *
     * The section's own rows only — a job's achievements live inside its row group,
     * so a descendant lookup would mix two sets and compare orderings of different
     * things.
     */
    const newestFirst = async () => {
      await page.waitForTimeout(300)
      return page.evaluate(() =>
        [...document.querySelectorAll('.inline-section > .inline-rows > .inline-row-group')]
          .filter((group) =>
            group
              .closest('.inline-section')
              ?.querySelector('h2')
              ?.textContent?.includes('Work history'),
          )
          .map((group) => ({
            heading: group.querySelector('.inline-row-heading')?.textContent ?? '',
            // The start date is what reverse chronology means for a job.
            start: group.querySelector('.inline-row-detail')?.textContent ?? '',
          })),
      )
    }
    const asListed = await newestFirst()
    const years = asListed.map((row) => Number((row.start.match(/\d{4}/) ?? ['0'])[0]))
    check(
      'jobs are listed newest first, and there is no way to change it',
      years.length > 1 &&
        years.every((year, index) => index === 0 || years[index - 1] >= year) &&
        (await page.getByLabel('Order', { exact: true }).count()) === 0,
      `${JSON.stringify(asListed.map((row) => row.start))}, order control: ${await page
        .getByLabel('Order', { exact: true })
        .count()}`,
    )
    /*
     * Reachable by Tab, rather than reachable by `.focus()`.
     *
     * The previous version of this check focused the toggle and asserted that it was
     * focused, which is a tautology: it would pass on a page where nothing could ever
     * reach it by keyboard. Pressing Tab from the top of the document and finding it
     * is the claim worth making, and it is what fails if the row's controls are
     * dropped from the tab order, reordered into somewhere unreachable, or covered
     * by something.
     */
    await page.evaluate(() => {
      document.body.focus()
      // Start from the very beginning of the document's tab order.
      const first = document.querySelector('a[href], button, input, select, textarea')
      first?.blur()
    })
    let reached = false
    for (let step = 0; step < 80 && !reached; step += 1) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() =>
        (document.activeElement?.className ?? '').includes('inline-row-toggle'),
      )
    }
    check(
      'a row toggle is reachable by Tab from the top of the page',
      reached,
      `not reached in 80 tabs; focus is on ${await page.evaluate(
        () => document.activeElement?.tagName ?? 'nothing',
      )}`,
    )
    await firstRowToggle.press('Enter')
    await page.locator('.record-form').waitFor()
    check(
      'opening a form with the keyboard moves focus into it',
      (await landedIn()) === 'inside the form',
      await landedIn(),
    )
    // Escape is the browser's, not the app's, and what it does with focus is
    // Chromium's to decide — asserting that would be testing the browser. What is
    // the app's business is that a key it does not handle does not close a form the
    // user is part-way through filling in.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    check(
      'Escape does not close a form that has unsaved input',
      (await page.locator('.record-form').count()) > 0,
      `${await page.locator('.record-form').count()} forms`,
    )
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()
    await page.waitForTimeout(200)
    // To the Edit button specifically, which is the control that opened the form —
    // the row also has a heading disclosure, and returning focus to that one would
    // leave the user somewhere that looks like the right row but is the wrong
    // control for what they were doing.
    check(
      'cancelling returns focus to the control that opened the form',
      // The focus is put back a frame or two after the page has changed, so this
      // waits for it rather than reading it the instant the form goes.
      await page
        .waitForFunction(
          () => {
            const active = document.activeElement
            return (
              active !== null &&
              active.closest('.inline-row-actions') !== null &&
              active.textContent?.trim() === 'Edit'
            )
          },
          undefined,
          { timeout: 5000 },
        )
        .then(
          () => true,
          () => false,
        ),
      await page.evaluate(() => {
        const active = document.activeElement
        return active === null
          ? 'none'
          : `${active.tagName}.${active.className || '(no class)'}`
      }),
    )

    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Principal Engineer' })
      .first()
      .getByRole('button', { name: /Hide/ })
      .click()
    // Wait for the row to detach rather than counting straight after the click:
    // an immediate count is taken before React re-renders and would pass against
    // a delete that never happened.
    const goneFromList = await page
      .locator('.inline-row')
      .filter({ hasText: 'Principal Engineer' })
      .first()
      .waitFor({ state: 'detached', timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
    check('a deleted record leaves the editor', goneFromList)

    const undoShown = await page
      .locator('.undo-bar')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
    check('deleting offers an undo rather than vanishing silently', undoShown)

    await page.getByLabel('Hidden records').check()
    const stillFindable = await page
      .locator('.inline-row.is-deleted')
      .filter({ hasText: 'Principal Engineer' })
      .first()
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
    check('a deleted record is still findable behind "show deleted" (D51)', stillFindable)

    // The list views offer the same thing: a deleted record is offered back.
    await go(page, origin, '/profiles')
    await page.locator('.record-list').waitFor()
    const listRow = page.locator('.record-row').first()
    const listHeading = (await listRow.locator('.record-row-heading').innerText()).trim()
    await listRow.getByRole('button', { name: `Hide ${listHeading}` }).click()
    await page.waitForTimeout(600)
    await page.getByLabel('Show hidden').check()
    await page.waitForTimeout(300)
    const deletedListRow = page.locator('.record-row.is-deleted').first()
    check(
      'a deleted record in a list view offers to be recovered too',
      (await deletedListRow.getByRole('button', { name: `Recover ${listHeading}` }).count()) ===
        1 &&
        (await deletedListRow.getByRole('button', { name: `Hide ${listHeading}` }).count()) ===
          0,
    )
    await deletedListRow.getByRole('button', { name: `Recover ${listHeading}` }).click()
    await page.waitForTimeout(600)
    check(
      'and recovering it brings it back',
      (await page.locator('.record-row.is-deleted').count()) === 0,
    )

    // ------------------------------------------------------------- profile
    // Picking a profile from the document page, where its effect is visible.
    // Reached through the list's own link rather than by typing the route, which
    // is how a user gets there and where the form sends them back to.
    await go(page, origin, '/profiles')
    await page.getByRole('link', { name: 'Add profile', exact: true }).click()
    await page.getByRole('heading', { name: 'Add profile' }).waitFor()
    await fill(page, 'Name', 'International')
    await fill(page, 'Title', 'Consultant')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    // Waited for the new row specifically; the Domestic one is already there, so
    // waiting for "any row" would return immediately.
    await page
      .locator('.record-row')
      .filter({ hasText: 'International' })
      .first()
      .waitFor({ timeout: 10000 })

    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    await page
      .locator('.doc-empty')
      .filter({ hasText: 'No profile is selected' })
      .waitFor({ timeout: 10000 })
      .catch(() => undefined)
    const picker = page.getByLabel('Profile', { exact: true })
    check('the document page has a profile picker', (await picker.count()) === 1)

    // Two profiles now exist, so there is no automatic choice.
    check(
      'with several profiles and none chosen, the document says so',
      (await page.locator('.doc').innerText()).includes('No profile is selected'),
    )

    // There is no way to select "no profile": a document with no name and no
    // contact details is not a CV.
    check(
      'the profile picker offers no None option',
      (await picker.locator('option', { hasText: /^\s*None\s*$/ }).count()) === 0,
    )
    check(
      'the profile picker prompts when several profiles exist and none is chosen',
      (await picker.locator('option[disabled]', { hasText: 'Choose a profile' }).count()) === 1,
    )

    await picker.selectOption({ label: 'International' })
    await page.locator('.doc').filter({ hasText: 'Consultant' }).waitFor({ timeout: 10000 })
    check('choosing a profile changes the document header', true)

    // And the choice persists, which is the same record wherever it is read from.
    await go(page, origin, '/document')
    check(
      'the choice is stored, not local to the document page',
      (await page.getByLabel('Profile', { exact: true }).inputValue()) !== '',
    )

    check(
      'and the picker offers no None option either',
      (await page
        .getByLabel('Profile', { exact: true })
        .locator('option', { hasText: /^\s*None\s*$/ })
        .count()) === 0,
    )

    // Back to the only-profile case for the remaining document checks.
    await go(page, origin, '/document')
    await page.getByLabel('Profile', { exact: true }).selectOption({ label: 'Domestic' })
    await page
      .locator('.doc')
      .filter({ hasText: 'Senior Engineer' })
      .waitFor({ timeout: 10000 })

    // ------------------------------------------------------- story placement
    // The job story belongs between the responsibilities and the achievements.
    // A job of its own, so the check does not depend on what earlier steps left
    // behind or on how much of it was edited.
    await createInEditor(page, origin, {
      section: 'Work history',
      label: 'job',
      expect: 'Storycheck',
      fields: {
        Company: 'Storycheck',
        'Job title': 'Role',
        'Start date': '2019-01-01',
        Responsibilities: 'RESPONSIBILITIES_TEXT',
        Story: 'JOB_STORY_TEXT',
      },
    })

    check(
      'an achievement can be added from the editor',
      await createInEditor(page, origin, {
        section: 'Work history',
        label: 'achievement',
        expect: 'ACHIEVEMENT_TEXT',
        fields: { Job: 'Storycheck - Role', Achievement: 'ACHIEVEMENT_TEXT' },
      }),
    )

    await go(page, origin, '/document')
    await page.getByLabel('Template', { exact: true }).selectOption('interview')
    await page.locator('.doc-job').filter({ hasText: 'Storycheck' }).first().waitFor()
    const storyJob = await page
      .locator('.doc-job')
      .filter({ hasText: 'Storycheck' })
      .first()
      .innerText()
    const order = ['RESPONSIBILITIES_TEXT', 'JOB_STORY_TEXT', 'ACHIEVEMENT_TEXT'].map((text) =>
      storyJob.indexOf(text),
    )
    check(
      'the job story sits between the responsibilities and the achievements',
      order[0] >= 0 && order[1] > order[0] && order[2] > order[1],
      `offsets ${JSON.stringify(order)}`,
    )

    // ------------------------------------------------------- job header line
    // `<dates>  <company>: <job title>`, with the dates in a fixed-width column.
    await go(page, origin, '/document')
    const headerJob = page.locator('.doc-job').filter({ hasText: 'Storycheck' }).first()
    await headerJob.waitFor()
    const head = headerJob.locator('.doc-job-head').first()
    const dateText = (await head.locator('.doc-job-dates').innerText()).trim()
    const titleText = (await head.locator('.doc-job-title').innerText()).trim()
    check(
      'the header line reads as dates then company then job title',
      /\d{4}/.test(dateText) && /^Storycheck: Role$/.test(titleText),
      `${dateText} | ${titleText}`,
    )

    // The dates open the line, flush to the margin, rather than sitting at the
    // right of their column.
    const datesAlign = await head
      .locator('.doc-job-dates')
      .evaluate((n) => getComputedStyle(n).textAlign)
    check(
      'the dates are left-aligned in their column',
      datesAlign === 'left',
      `text-align: ${datesAlign}`,
    )
    const datesInset = await head
      .locator('.doc-job-dates')
      .evaluate((n) =>
        Math.round(
          n.getBoundingClientRect().left - n.parentElement.getBoundingClientRect().left,
        ),
      )
    check(
      'the dates start at the left edge of the header line',
      datesInset === 0,
      `${datesInset}px from the left edge`,
    )

    // The dates share one line with the title, not a line of their own.
    const headBox = await head.boundingBox()
    const datesBox = await head.locator('.doc-job-dates').boundingBox()
    check(
      'the dates sit on the same line as the title',
      Math.abs(datesBox.y - headBox.y) < headBox.height,
      `dates at ${datesBox?.y}, head at ${headBox?.y}`,
    )

    // The dates occupy one fixed measure, which is what lines the names up.
    const widths = await page
      .locator('.doc-job-dates')
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().width)),
      )
    check(
      'every date range occupies the same width',
      new Set(widths).size === 1,
      JSON.stringify(widths),
    )

    // Company names start in the same place.
    const lefts = await page
      .locator('.doc-job-title')
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
      )
    check(
      'every company name starts in the same place',
      new Set(lefts).size === 1,
      JSON.stringify(lefts),
    )

    // The responsibilities and the first bullet are close together.
    const gap = await page.evaluate(() => {
      const job = [...document.querySelectorAll('.doc-job')].find((node) =>
        (node.textContent ?? '').includes('RESPONSIBILITIES_TEXT'),
      )
      if (!job) return null
      const body = job.querySelector('.doc-body')
      const list = job.querySelector('.doc-achievements')
      if (!body || !list) return null
      return list.getBoundingClientRect().top - body.getBoundingClientRect().bottom
    })
    check(
      'there is little space between the responsibilities and the first bullet',
      gap !== null && gap < 12,
      `gap was ${String(gap)}px`,
    )

    // The removed list pages. Achievements, awards and education are edited only
    // from the all-in-one editor, so their standalone routes must not resolve —
    // a route that 404s with a "back to the start" is the honest answer, not a
    // silent empty list.
    check(
      'the navigation offers the work history and the questions, and nothing else',
      JSON.stringify(await page.locator('.app-nav a').allInnerTexts()) ===
        JSON.stringify(['Work history', 'Questions']),
      JSON.stringify(await page.locator('.app-nav a').allInnerTexts()),
    )
    /*
     * Settings is an icon, which is the sort of change that can quietly cost the
     * link its name: remove the word and a screen reader announces an image. So
     * the name is asserted on the link rather than left to the SVG, and the SVG is
     * asserted hidden — the two together are what "still a button called Settings"
     * means.
     */
    const settingsLink = page.locator('.app-header-controls a[href="#/settings"]')
    check(
      'Settings is a gear icon with no word beside it',
      (await settingsLink.innerText()).trim() === '' &&
        (await settingsLink.locator('svg').count()) === 1,
      JSON.stringify(await settingsLink.innerText()),
    )
    check(
      'the gear is decorative and the link carries the name',
      (await settingsLink.getAttribute('aria-label')) === 'Settings' &&
        (await settingsLink.locator('svg[aria-hidden="true"]').count()) === 1,
    )
    check(
      'the header controls are right-aligned',
      await page.evaluate(() => {
        const header = document.querySelector('.app-header').getBoundingClientRect()
        const controls = document.querySelector('.app-header-controls').getBoundingClientRect()
        // Flush against the right edge, and past the middle so it is not merely
        // sitting at the end of the nav by accident.
        return Math.abs(header.right - controls.right) < 1 && controls.left > header.width / 2
      }),
    )
    // The point of retiring the jobs list: work history is edited on the edit-all
    // page, so the list route has to actually be gone rather than merely unlinked.
    // The "new" routes are not lists, and they are still here — a record is added
    // on a page of its own now.
    for (const removed of ['/jobs', '/achievements', '/awards', '/education']) {
      await go(page, origin, removed)
      check(
        `the ${removed} list page is gone`,
        (await page.locator('.record-row').count()) === 0 &&
          (await page.getByText('Nothing is routed at').count()) === 1,
        await page
          .locator('.app-main')
          .innerText()
          .catch(() => ''),
      )
    }

    /*
     * Templates.
     *
     * A template is a named set of document settings (D54). The one that ships is
     * the document the app has always produced, so an existing user's first load
     * looks exactly like their previous load.
     */
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    const templateSelect = page.locator('#document-template')
    check(
      'the built-in template is there, and it is the one in use',
      (await templateSelect.count()) === 1 &&
        (await templateSelect.inputValue()) !== '' &&
        (await templateSelect.locator('option').allInnerTexts()).includes('Standard'),
      JSON.stringify(await templateSelect.locator('option').allInnerTexts()),
    )
    check(
      'and it says what it is before it is chosen (D60)',
      (await page.locator('.document-template-summary').innerText()).length > 0,
      await page.locator('.document-template-summary').innerText(),
    )

    /*
     * The content card decides what is in the document.
     *
     * A section the user has left out is not in the document at all, rather than
     * in it and empty: an empty section prints as a gap.
     */
    const sectionLabels = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.doc-section')].map((section) =>
          section.getAttribute('aria-label'),
        ),
      )
    const withWorkHistory = await sectionLabels()
    check(
      'the document has its sections',
      withWorkHistory.length > 0,
      JSON.stringify(withWorkHistory),
    )

    const workHistoryToggle = page
      .locator('.document-includes')
      .getByLabel('Work history', { exact: true })
    await workHistoryToggle.uncheck()
    await page.waitForTimeout(400)
    check(
      'leaving the work history out takes it out of the document',
      !(await sectionLabels()).includes('Work history'),
      JSON.stringify(await sectionLabels()),
    )
    await workHistoryToggle.check()
    await page.waitForTimeout(400)
    check(
      'and putting it back puts it back',
      (await sectionLabels()).includes('Work history'),
      JSON.stringify(await sectionLabels()),
    )

    // And a template made from the current settings reproduces it.
    await page.getByRole('button', { name: 'Save current as a template' }).click()
    await page.locator('#document-template-name').fill('Reordered')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(600)
    check(
      'a template can be made from the current settings (D61)',
      (await templateSelect.locator('option').allInnerTexts()).includes('Reordered'),
      JSON.stringify(await templateSelect.locator('option').allInnerTexts()),
    )

    // Choosing a template is a choice of settings, not of records: the profile
    // the CV is for is not one of them (D56).
    const profileBefore = await page.locator('#document-profile').inputValue()
    await templateSelect.selectOption({ label: 'Reordered' })
    await page.waitForTimeout(400)
    check(
      'choosing a template does not change who the document is for (D56)',
      (await page.locator('#document-profile').inputValue()) === profileBefore,
      `${await page.locator('#document-profile').inputValue()} vs ${profileBefore}`,
    )

    // Back to the built-in, and the document goes back with it.
    await templateSelect.selectOption({ label: 'Standard' })
    await page.waitForTimeout(500)
    check(
      'choosing the built-in template puts the document back as it was',
      JSON.stringify(await sectionLabels()) === JSON.stringify(withWorkHistory),
      JSON.stringify(await sectionLabels()),
    )

    // A template that is not built-in can be deleted, and brought back.
    await templateSelect.selectOption({ label: 'Reordered' })
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForTimeout(500)
    check(
      'a template that is not built-in can be deleted (D62)',
      !(await templateSelect.locator('option').allInnerTexts()).includes('Reordered'),
      JSON.stringify(await templateSelect.locator('option').allInnerTexts()),
    )
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await page.waitForTimeout(500)
    check(
      'and the delete can be undone',
      (await templateSelect.locator('option').allInnerTexts()).includes('Reordered'),
      JSON.stringify(await templateSelect.locator('option').allInnerTexts()),
    )

    /*
     * The phrases: the writing-support material (Phase 9).
     *
     * The point of them is that they are offered in the form they are used in, so
     * the check is that a phrase lands in the field being written.
     */
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    await page
      .locator('.inline-section')
      .filter({ has: page.locator('h2', { hasText: 'Phrases' }) })
      .getByRole('link', { name: 'Add phrase', exact: true })
      .click()
    await page.locator('.record-form').waitFor()
    await fill(page, 'Phrase', 'Cut the billing page load time in half')
    await fill(page, 'When to use it', 'For anything about speed')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(700)
    check(
      'a phrase can be written',
      (
        await page.locator('.inline-section').filter({ hasText: 'Phrases' }).innerText()
      ).includes('Cut the billing page load time in half'),
    )

    // And it can be reached from the achievement form.
    await go(page, origin, '/jobs/new')
    await page.locator('.record-form').waitFor()
    await fill(page, 'Company', 'Phrase Co')
    await fill(page, 'Job title', 'Role')
    await fill(page, 'Start date', '2024-01-01')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(700)
    await go(page, origin, '/achievements/new')
    await page.locator('.record-form').waitFor()
    await page.getByText('Phrases', { exact: true }).click()
    await page.waitForTimeout(200)
    check(
      'the phrases are offered in the achievement form',
      (await page.locator('.record-assist-list button').count()) === 1,
      `${await page.locator('.record-assist-list button').count()} phrases`,
    )
    await page.locator('.record-assist-list button').first().click()
    await page.waitForTimeout(200)
    check(
      'and clicking one puts it in the field being written',
      (await page.getByLabel('Achievement', { exact: true }).inputValue()) ===
        'Cut the billing page load time in half',
      await page.getByLabel('Achievement', { exact: true }).inputValue(),
    )

    /*
     * The assistant's key.
     *
     * The property that matters is that the key never reaches the document: the
     * document syncs to Dropbox and is exported to employers, and a credential in
     * it would travel to a third party and be written into a file sent to an
     * employer.
     */
    await go(page, origin, '/settings')
    await page.locator('.settings-page').waitFor()
    check(
      'the drafting panel is not offered without a key',
      (await page.locator('#provider-key').count()) === 1,
    )
    await fill(page, 'Your provider key', 'sk-not-a-real-key-but-long-enough')
    await page.getByRole('button', { name: 'Save key', exact: true }).click()
    await page.waitForTimeout(300)
    await go(page, origin, '/achievements/new')
    await page.locator('.record-form').waitFor()
    check(
      'with a key it is offered',
      (await page.locator('.record-assist summary').allInnerTexts()).includes(
        'Draft with an assistant',
      ),
      JSON.stringify(await page.locator('.record-assist summary').allInnerTexts()),
    )
    // The key must not be anywhere in the document: the document syncs to
    // Dropbox and is exported to employers, and a credential in it would travel
    // to a third party and be written into a file sent to an employer.
    const leaked = await page.evaluate(async (secret) => {
      const databases = await globalThis.indexedDB.databases()
      const name = databases.find((db) => db.name?.includes('career-management'))
      if (name === undefined) return 'no database'
      const db = await new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(name.name)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const storeNames = [...db.objectStoreNames]
      for (const store of storeNames) {
        const rows = await new Promise((resolve, reject) => {
          const request = db.transaction(store, 'readonly').objectStore(store).getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        if (JSON.stringify(rows).includes(secret)) return store
      }
      return null
    }, 'sk-not-a-real-key-but-long-enough')
    check('and the key is nowhere in the document', leaked === null, String(leaked))

    /*
     * A laptop screen.
     *
     * The card is the width of the printed page's text column and the app is
     * wide enough to hold it beside the rail, so on a 1280px screen — which is
     * what the rest of this suite already runs at — the card is not squeezed and
     * nothing spills off the side of the page.
     *
     * The card's measure is fixed in points, so it does not depend on the
     * viewport; what the viewport decides is whether the card has room.
     */
    await page.setViewportSize({ width: 1280, height: 720 })
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    const laptop = await page.evaluate(() => {
      const doc = document.querySelector('.doc')
      const style = getComputedStyle(doc)
      const rect = doc.getBoundingClientRect()
      return {
        // The measure, as the document is laid out: the computed width, which is
        // the content box and is not the zoom the card is shown at.
        measure: parseFloat(style.width),
        // The card as it is drawn, which is the measure times the zoom.
        drawn: rect.width,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }
    })
    check(
      'the card keeps the printed page measure on a laptop screen',
      // 535.75pt of A4 text, at the browser's 96dpi.
      Math.abs(laptop.measure - 714.33) < 1,
      `${laptop.measure.toFixed(1)}px`,
    )
    check(
      'and it is drawn larger than the page, so it can be read',
      laptop.drawn > laptop.measure,
      `${laptop.drawn.toFixed(1)}px drawn`,
    )
    check(
      'and the page does not scroll sideways',
      laptop.scrollWidth <= laptop.clientWidth,
      `${laptop.scrollWidth} > ${laptop.clientWidth}`,
    )
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    const editorWidth = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    check(
      'and neither does the editor',
      editorWidth.scrollWidth <= editorWidth.clientWidth,
      `${editorWidth.scrollWidth} > ${editorWidth.clientWidth}`,
    )

    /*
     * The format is one card in the rail.
     *
     * The paper, the type, the spacing and the layout were on the settings page,
     * and the template and the sections were in the rail, and it was one choice
     * split across two places. The card holds all of it, and the settings page
     * does not repeat it.
     */
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    check(
      'the rail has one card for the format',
      (await page.locator('.document-format').count()) === 1 &&
        (await page.locator('.document-format-title').innerText()).toLowerCase() === 'format',
    )
    const cardLabels = await page.locator('.document-format label').allInnerTexts()
    check(
      'and it holds the template, the paper, the type, the spacing and the layout',
      ['Style', 'Whitespace'].every((label) =>
        cardLabels.some((shown) => shown.startsWith(label)),
      ) && cardLabels.some((shown) => shown.startsWith('Type size')),
      JSON.stringify(cardLabels),
    )
    await go(page, origin, '/settings')
    await page.locator('.settings-page').waitFor()
    const settingsLabels = await page.locator('.settings-page label').allInnerTexts()
    check(
      'and the settings page does not repeat them',
      !settingsLabels.some((label) =>
        ['Page size', 'Type size', 'Spacing', 'Layout'].some((moved) =>
          label.startsWith(moved),
        ),
      ),
      JSON.stringify(settingsLabels),
    )

    // The formats the document can be taken away in (D23), behind one button.
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    await page.locator('.export-menu > summary').click()
    await page.waitForTimeout(200)
    const exportButtons = page.locator('.export-menu-list button')
    check(
      'the document can be exported as Markdown, plain text and Word',
      (await exportButtons.count()) === 3 &&
        (await exportButtons.allInnerTexts()).join(',') === 'Markdown,Plain text,Word',
      (await exportButtons.allInnerTexts()).join(','),
    )
    check(
      'and each says what it is, so the choice is not a surprise afterwards (D39)',
      (await page.locator('.export-menu-list button').first().getAttribute('title')) !== null,
    )
    check(
      'the export button sits beside the print button, on one line',
      await page.evaluate(() => {
        const row = document.querySelector('.document-actions')
        const print = row.querySelector('button')
        const menu = row.querySelector('.export-menu')
        if (print === null || menu === null) return false
        const a = print.getBoundingClientRect()
        const b = menu.getBoundingClientRect()
        // Side by side rather than stacked.
        return Math.abs(a.top - b.top) < 4 && b.left >= a.right - 1
      }),
    )

    for (const added of ['/jobs/new', '/achievements/new', '/awards/new', '/education/new']) {
      await go(page, origin, added)
      check(
        `the ${added} form is there`,
        (await page.locator('.record-form').count()) === 1,
        await page
          .locator('.app-main')
          .innerText()
          .catch(() => ''),
      )
    }

    /*
     * Editing on a page of its own.
     *
     * The point of the change is that opening a record does not expand the page
     * under you, so the checks are about what the page looks like while the form
     * is open — the editor is nowhere to be seen — and about where the form sends
     * you back to.
     */
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    const beforeRows = await page.locator('.all-in-one-content .inline-row').count()
    // Any row: which jobs are still around depends on what the run has deleted
    // by now, and the point of the check is the page, not the record.
    await page
      .locator('.all-in-one-content .inline-row')
      .first()
      .getByRole('link', { name: 'Edit', exact: true })
      .click()
    await page.locator('.record-form').waitFor()
    check(
      'opening a record leaves the editor behind',
      (await page.locator('.all-in-one').count()) === 0,
      'the form is a page of its own',
    )
    check(
      'and the rows are not on the page any more',
      (await page.locator('.all-in-one-content .inline-row').count()) === 0,
      `${beforeRows} rows before`,
    )
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.locator('.all-in-one').waitFor()
    check(
      'cancelling comes back to the page the form was opened from',
      (await page.locator('.all-in-one-content .inline-row').count()) === beforeRows,
      `${await page.locator('.all-in-one-content .inline-row').count()} rows, expected ${beforeRows}`,
    )
    check(
      'and the focus is back on the control that opened it',
      // The focus is put back a frame or two after the page has changed, so this
      // waits for it rather than reading it the instant the form goes.
      await page
        .waitForFunction(
          () => {
            const active = document.activeElement
            return (
              active !== null &&
              active.closest('.inline-row-actions') !== null &&
              active.textContent?.trim() === 'Edit'
            )
          },
          undefined,
          { timeout: 5000 },
        )
        .then(
          () => true,
          () => false,
        ),
      await page.evaluate(() => {
        const active = document.activeElement
        return active === null
          ? 'none'
          : `${active.tagName}.${active.className || '(no class)'}`
      }),
    )

    // The questions page has its own editor, and a form opened from it has to
    // come back there rather than to the career page.
    await go(page, origin, '/interview')
    await page.locator('.questions-page').waitFor()
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Behavioural' })
      .first()
      .getByRole('link', { name: 'Edit', exact: true })
      .click()
    await page.locator('.record-form').waitFor()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.locator('.questions-page').waitFor()
    check(
      'a form opened from the questions page comes back to the questions page',
      (await page.locator('.questions-page').count()) === 1,
      await page
        .locator('.app-main')
        .innerText()
        .catch(() => ''),
    )
    // And the nav entry that replaced it has to arrive somewhere.
    await go(page, origin, '/')
    await page.locator('.app-nav a').filter({ hasText: 'Work history' }).click()
    await page.locator('.all-in-one').waitFor()
    check(
      'the Work history link opens the edit-all page',
      (await page.locator('.inline-section h2').allInnerTexts()).includes('Work history'),
    )
    // Delete and undo from the editor (U5). The same behaviour as the list views:
    // a delete that cannot be taken back is how a tombstone becomes data loss.
    await createInEditor(page, origin, {
      section: 'Work history',
      label: 'job',
      expect: 'Deletable Co',
      fields: { Company: 'Deletable Co', 'Start date': '2020-01-01' },
    })

    await go(page, origin, '/')
    const deletable = () =>
      page.locator('.all-in-one-content .inline-row').filter({ hasText: 'Deletable Co' })
    await deletable().first().getByRole('button', { name: 'Hide', exact: true }).click()
    await page.waitForTimeout(500)
    check('a record can be deleted from the edit-all page', (await deletable().count()) === 0)
    check(
      'deleting from the edit-all page offers undo',
      (await page.locator('.undo-bar').count()) === 1,
    )
    await page.locator('.undo-bar').getByRole('button', { name: 'Undo' }).click()
    await page.waitForTimeout(500)
    check('undo brings the record back', (await deletable().count()) === 1)
    check(
      'the undo bar is dismissed once used',
      (await page.locator('.undo-bar').count()) === 0,
    )

    // The job header line, which the earlier commit made dates-first and
    // left-aligned; these are the two properties that were asked for and were
    // verified by hand at the time.
    await go(page, origin, '/document')
    await page.locator('.doc-job').first().waitFor()
    await page.emulateMedia({ media: 'print' })
    const header = await page.evaluate(() => {
      const head = document.querySelector('.doc-job-head')
      if (head === null) return null
      const dates = head.querySelector('.doc-job-dates')
      const title = head.querySelector('.doc-job-title')
      const body = getComputedStyle(head.closest('.doc'))
      const datesStyle = getComputedStyle(dates)
      const titleStyle = getComputedStyle(title)
      return {
        datesAtLeft:
          Math.round(dates.getBoundingClientRect().left) ===
          Math.round(head.getBoundingClientRect().left),
        align: datesStyle.textAlign,
        sameSize:
          datesStyle.fontSize === titleStyle.fontSize && datesStyle.fontSize === body.fontSize,
        bothBold: datesStyle.fontWeight === '700' && titleStyle.fontWeight === '700',
        // The column must fit the longest possible range, or a long range wraps
        // and breaks the alignment the column exists for.
        fits: dates.scrollWidth <= dates.clientWidth,
        // Narrow gap: the fixed date column already aligns every company name,
        // so a wide gap on top of it reads as two separate fields.
        gap: Math.round(
          title.getBoundingClientRect().left - dates.getBoundingClientRect().right,
        ),
      }
    })
    check(
      'the job header line is dates then title, same size, both bold, no wrapping',
      header !== null &&
        header.datesAtLeft &&
        header.align === 'left' &&
        header.sameSize &&
        header.bothBold &&
        header.fits,
      JSON.stringify(header),
    )
    check(
      'little space between the date range and the job title',
      header !== null && header.gap <= 4,
      `${header?.gap}px`,
    )

    // Achievement bullets are single-spaced. The body's 1.45 is right for prose
    // and wrong for a short dense bullet, and it costs page space in the one
    // document with a page target.
    const bullet = await page.evaluate(() => {
      const item = document.querySelector('.doc-achievement')
      if (item === null) return null
      const style = getComputedStyle(item)
      return {
        lineHeight: style.lineHeight,
        fontSize: style.fontSize,
        bodyLineHeight: getComputedStyle(item.closest('.doc')).lineHeight,
      }
    })
    check(
      'achievement bullets are single-spaced',
      bullet !== null &&
        parseFloat(bullet.lineHeight) <= parseFloat(bullet.fontSize) + 0.5 &&
        parseFloat(bullet.lineHeight) < parseFloat(bullet.bodyLineHeight),
      JSON.stringify(bullet),
    )

    // The responsibilities paragraph is the same kind of text as a bullet, so it
    // is spaced the same way. Left at the prose setting it reads as a paragraph
    // sitting above a list, in a document that is all one or the other.
    const responsibilities = await page.evaluate(() => {
      const paragraph = document.querySelector('.doc-body p')
      if (paragraph === null) return null
      const style = getComputedStyle(paragraph)
      return {
        lineHeight: style.lineHeight,
        fontSize: getComputedStyle(paragraph.parentElement).fontSize,
        bodyLineHeight: getComputedStyle(paragraph.closest('.doc')).lineHeight,
      }
    })
    check(
      'the responsibilities paragraph is single-spaced',
      responsibilities !== null &&
        parseFloat(responsibilities.lineHeight) <=
          parseFloat(responsibilities.fontSize) + 0.5 &&
        parseFloat(responsibilities.lineHeight) < parseFloat(responsibilities.bodyLineHeight),
      JSON.stringify(responsibilities),
    )

    // The margin under an achievement separates it from the next one; on the last
    // of a list it separated nothing and doubled the gap before the next job.
    //
    // Asserted as the rule, not as a measured gap between two named jobs: what is
    // still in the document depends on what earlier checks deleted, so an adjacency
    // assertion would quietly stop testing anything.
    const trailingMargin = await page.evaluate(() => {
      // The rule, read off a list with more than one bullet where there is one.
      // With a single bullet there is nothing to separate it from, so the check
      // reports that rather than passing on the absence of a comparison.
      const all = [...document.querySelectorAll('.doc-achievement')]
      if (all.length === 0) return null
      const withSiblings = all.find((item) => item.previousElementSibling !== null)
      const last = all.filter((item) => item.nextElementSibling === null).pop()
      return {
        withSiblings: withSiblings !== undefined,
        lastMarginBottom: parseFloat(getComputedStyle(last).marginBottom),
        siblingMarginBottom:
          withSiblings !== undefined
            ? parseFloat(getComputedStyle(withSiblings).marginBottom)
            : null,
      }
    })
    check(
      'the last achievement in a list carries no trailing margin, others do',
      trailingMargin !== null &&
        trailingMargin.lastMarginBottom === 0 &&
        (trailingMargin.withSiblings
          ? trailingMargin.siblingMarginBottom > 0
          : trailingMargin.siblingMarginBottom === null),
      JSON.stringify(trailingMargin),
    )

    await page.emulateMedia({ media: 'screen' })

    // -------------------------------------------------------------------- sync
    // The scheduler starts with the app. With no credential it must settle as
    // "not connected" rather than reporting an expired token — a first run has
    // no token to have expired, and that message would send the user to
    // reconnect a connection that never existed.
    await go(page, origin, '/sync')
    await page.locator('.sync-page').waitFor()
    check('the sync page renders', (await page.locator('.sync-page').count()) === 1)

    /*
     * Compressed and expanded differ by exactly one thing: a blank line after every
     * job. Measured on the job's own bottom margin, because that is the gap between
     * one role and the next and it is what the format is asking for.
     */
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    const jobGaps = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.doc-job')].map((job) => ({
          summarised: job.classList.contains('doc-job-summarised'),
          achievements: job.querySelectorAll('.doc-achievements').length > 0,
          bottom: parseFloat(getComputedStyle(job).marginBottom),
        })),
      )
    const compressed = await jobGaps()
    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    await page.getByLabel('Whitespace', { exact: true }).selectOption('additional')
    await page.waitForTimeout(400)
    const expanded = await jobGaps()

    check(
      'compressed is the default, with no blank line after a role',
      compressed.length > 0 && compressed.every((job) => job.bottom <= 4),
      JSON.stringify(compressed),
    )
    check(
      'expanded puts a blank line after every role',
      expanded.length === compressed.length &&
        expanded.every((job) => job.summarised === false && job.bottom > 12 && job.bottom < 24),
      `compressed ${JSON.stringify(compressed)} / expanded ${JSON.stringify(expanded)}`,
    )
    check(
      'a role with no achievements still gets the blank line',
      expanded.some((job) => !job.summarised && !job.achievements && job.bottom > 12),
      JSON.stringify(expanded),
    )
    await page.getByLabel('Whitespace', { exact: true }).selectOption('compact')
    await page.waitForTimeout(400)
    /*
     * The about page, and the claim it exists to make.
     *
     * Checked by looking for the actual sentences rather than for the page heading:
     * "About" could render while the paragraph that says who holds the data did not,
     * and the whole point of the page is that sentence.
     */
    await go(page, origin, '/about')
    await page.locator('.about-page').waitFor()
    const about = page.locator('.about-page')
    check('the about page is reachable from the header', (await about.count()) === 1)
    check(
      'it says where the data lives',
      (await about.getByText('Where your data lives', { exact: true }).count()) === 1,
    )
    check(
      'it says the data is stored in this browser',
      (await about.getByText('this browser, on this device', { exact: false }).count()) === 1,
    )
    check(
      'it says we do not have the data',
      (await about.getByText('We do not have your data', { exact: true }).count()) === 1,
    )
    check(
      'it names the one place a copy can go, and whose it is',
      (await about.getByText('your own Dropbox', { exact: false }).count()) >= 1,
    )
    check(
      'it says syncing is optional',
      (await about.getByText('Syncing is optional', { exact: true }).count()) === 1,
    )

    /*
     * Manual order of a job's achievements.
     *
     * The point of the feature is the printed document, so every check here ends
     * at the document rather than at the editor: the editor is where the order is
     * made, and the document is where it has to be honoured.
     */
    await createInEditor(page, origin, {
      section: 'Work history',
      label: 'job',
      expect: 'Orderable Co',
      fields: { Company: 'Orderable Co', 'Job title': 'Role', 'Start date': '2021-01-01' },
    })
    for (const name of ['FIRST', 'SECOND', 'THIRD']) {
      await createInEditor(page, origin, {
        section: 'Work history',
        label: 'achievement',
        expect: name,
        fields: { Job: 'Orderable Co - Role', Achievement: name },
      })
    }

    const orderableGroup = page
      .locator('.inline-row-group')
      .filter({ hasText: 'Orderable Co' })
      .first()
    const achievementRows = orderableGroup.locator('.inline-children .inline-row')
    const editorOrder = async () =>
      (
        await orderableGroup.locator('.inline-children .inline-row-heading').allInnerTexts()
      ).map((text) => text.trim())
    const printedOrder = async () => {
      await go(page, origin, '/document')
      await page.locator('.doc').waitFor()
      return page.evaluate(() => {
        const job = [...document.querySelectorAll('.doc-job')].find((candidate) =>
          candidate.textContent.includes('Orderable Co'),
        )
        if (!job) return []
        return [...job.querySelectorAll('.doc-achievement')].map((item) =>
          item.textContent.trim(),
        )
      })
    }

    check(
      'a new achievement goes to the top of the list',
      JSON.stringify(await editorOrder()) === JSON.stringify(['THIRD', 'SECOND', 'FIRST']),
      JSON.stringify(await editorOrder()),
    )
    check(
      'the document prints them in the same order the editor shows',
      JSON.stringify(await printedOrder()) === JSON.stringify(['THIRD', 'SECOND', 'FIRST']),
      JSON.stringify(await printedOrder()),
    )

    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    check(
      'every achievement has a grip to drag it by',
      (await achievementRows.locator('.inline-order-handle').count()) === 3,
    )

    // Drag the last one to the top. Dropped on the top of the first row, so it
    // lands above it rather than in the middle of it.
    const handles = achievementRows.locator('.inline-order-handle')
    await handles.nth(2).dragTo(achievementRows.nth(0), { targetPosition: { x: 30, y: 2 } })
    await page.waitForTimeout(700)

    check(
      'dragging an achievement moves it',
      JSON.stringify(await editorOrder()) === JSON.stringify(['FIRST', 'THIRD', 'SECOND']),
      JSON.stringify(await editorOrder()),
    )
    check(
      'the document prints the order the user dragged',
      JSON.stringify(await printedOrder()) === JSON.stringify(['FIRST', 'THIRD', 'SECOND']),
      JSON.stringify(await printedOrder()),
    )

    /*
     * The keyboard route, because a drag is invisible without a mouse and the
     * document has to be reachable for everyone who has to read it.
     */
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    const keyboardHandle = achievementRows.nth(2).locator('.inline-order-handle')
    await keyboardHandle.focus()
    await keyboardHandle.press('Enter')
    check(
      'the grip says it has picked the record up',
      (await keyboardHandle.getAttribute('aria-pressed')) === 'true',
    )
    await keyboardHandle.press('ArrowUp')
    await page.waitForTimeout(700)
    check(
      'the arrow keys move it',
      JSON.stringify(await editorOrder()) === JSON.stringify(['FIRST', 'SECOND', 'THIRD']),
      JSON.stringify(await editorOrder()),
    )
    check(
      'and the move is announced',
      ((await orderableGroup.locator('.sr-only[role="status"]').textContent()) ?? '').includes(
        'SECOND',
      ),
    )
    check(
      'the document prints that too',
      JSON.stringify(await printedOrder()) === JSON.stringify(['FIRST', 'SECOND', 'THIRD']),
      JSON.stringify(await printedOrder()),
    )

    /*
     * The same thing for the questions in a category.
     *
     * The interview document rather than the CV one, because that is where the
     * questions are printed.
     */
    await createInEditor(page, origin, {
      section: 'Question categories',
      label: 'question category',
      expect: 'Orderable Category',
      fields: { Title: 'Orderable Category' },
      path: '/interview',
    })

    /*
     * The question is added from the category's own button, not the section's —
     * "Add question" is also the start of "Add question category", so the two have
     * to be told apart by the exact name and by the row they sit in.
     */
    const addQuestion = async (name) => {
      await go(page, origin, '/interview')
      await page.locator('.questions-page').waitFor()
      const category = page
        .locator('.inline-row-group')
        .filter({ hasText: 'Orderable Category' })
        .first()
      await category.getByRole('link', { name: 'Add question', exact: true }).click()
      await page.locator('.record-form').waitFor()
      await fill(page, 'Category', 'Orderable Category')
      await fill(page, 'Question', name)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.waitForTimeout(600)
    }

    for (const name of ['Q_FIRST', 'Q_SECOND', 'Q_THIRD']) {
      await addQuestion(name)
    }

    const questionGroup = page
      .locator('.inline-row-group')
      .filter({ hasText: 'Orderable Category' })
      .first()
    const questionRows = questionGroup.locator('.inline-children .inline-row')
    const questionEditorOrder = async () =>
      (await questionGroup.locator('.inline-children .inline-row-heading').allInnerTexts()).map(
        (text) => text.trim(),
      )
    const printedQuestions = async () => {
      await go(page, origin, '/document')
      await page.locator('.doc').waitFor()
      await page.getByLabel('Template', { exact: true }).selectOption('interview')
      await page.waitForTimeout(300)
      return page.evaluate(() => {
        const group = [...document.querySelectorAll('.doc-question-group')].find((candidate) =>
          candidate.textContent.includes('Orderable Category'),
        )
        if (!group) return []
        return [...group.querySelectorAll('.doc-question')].map((item) =>
          item.textContent.trim(),
        )
      })
    }

    check(
      'a new question goes to the top of the list',
      JSON.stringify(await questionEditorOrder()) ===
        JSON.stringify(['Q_THIRD', 'Q_SECOND', 'Q_FIRST']),
      JSON.stringify(await questionEditorOrder()),
    )
    check(
      'the preparation document prints them in the same order the editor shows',
      JSON.stringify(await printedQuestions()) ===
        JSON.stringify(['Q_THIRD', 'Q_SECOND', 'Q_FIRST']),
      JSON.stringify(await printedQuestions()),
    )

    await go(page, origin, '/interview')
    await page.locator('.questions-page').waitFor()
    check(
      'every question has a grip to drag it by',
      (await questionRows.locator('.inline-order-handle').count()) === 3,
    )

    const questionHandles = questionRows.locator('.inline-order-handle')
    await questionHandles
      .nth(2)
      .dragTo(questionRows.nth(0), { targetPosition: { x: 30, y: 2 } })
    await page.waitForTimeout(700)

    check(
      'dragging a question moves it',
      JSON.stringify(await questionEditorOrder()) ===
        JSON.stringify(['Q_FIRST', 'Q_THIRD', 'Q_SECOND']),
      JSON.stringify(await questionEditorOrder()),
    )
    check(
      'the preparation document prints the order the user dragged',
      JSON.stringify(await printedQuestions()) ===
        JSON.stringify(['Q_FIRST', 'Q_THIRD', 'Q_SECOND']),
      JSON.stringify(await printedQuestions()),
    )

    await go(page, origin, '/interview')
    await page.locator('.questions-page').waitFor()
    const questionKeyboardHandle = questionRows.nth(2).locator('.inline-order-handle')
    await questionKeyboardHandle.focus()
    await questionKeyboardHandle.press('Enter')
    await questionKeyboardHandle.press('ArrowUp')
    await page.waitForTimeout(700)
    check(
      'the arrow keys move a question',
      JSON.stringify(await questionEditorOrder()) ===
        JSON.stringify(['Q_FIRST', 'Q_SECOND', 'Q_THIRD']),
      JSON.stringify(await questionEditorOrder()),
    )
    check(
      'and the preparation document prints that too',
      JSON.stringify(await printedQuestions()) ===
        JSON.stringify(['Q_FIRST', 'Q_SECOND', 'Q_THIRD']),
      JSON.stringify(await printedQuestions()),
    )

    await go(page, origin, '/sync')
    await page.locator('.sync-page').waitFor()

    check(
      'an unconnected app offers Connect',
      (await page.getByRole('button', { name: 'Connect to Dropbox' }).count()) === 1,
    )
    /*
     * The state is an icon now, so it is read from the link's name and tooltip
     * rather than from its text — the point of shrinking it was that it no longer
     * carries words.
     */
    const syncName = await page.locator('.sync-indicator').getAttribute('aria-label')
    check(
      'the header reports the connection state',
      syncName === 'Sync: Not connected',
      syncName ?? 'no accessible name',
    )
    /*
     * The reason the old bubble held five labels was fixed-width, so the header
     * would not reflow while it was being watched. An icon has one shape for every
     * state, so what has to hold now is the icon itself: the cloud stays the same
     * size, and the state is a small glyph beside it.
     */
    const syncShape = await page.evaluate(() => {
      const cloud = document.querySelector('.sync-indicator svg')
      const glyphs = []
      for (let n = 0; n < 5; n++) {
        const badge = document.querySelector('.sync-indicator .sync-badge')
        badge.textContent = ['–', '↻', '!', '↑', '✓'][n]
        glyphs.push(badge.textContent)
        if (
          Math.round(cloud.getBoundingClientRect().width) !==
          Math.round(cloud.getBoundingClientRect().width)
        ) {
          return { moved: true, glyphs }
        }
      }
      return { moved: false, glyphs }
    })
    check(
      'the sync indicator is an icon, not words, and one size for every state',
      syncShape.moved === false && syncShape.glyphs.join('') === '–↻!↑✓',
      JSON.stringify(syncShape),
    )
    const syncInk = await page.evaluate(() => {
      const badge = document.querySelector('.sync-indicator .sync-badge')
      return {
        glyph: badge.textContent,
        size: [
          Math.round(badge.getBoundingClientRect().width),
          Math.round(badge.getBoundingClientRect().height),
        ],
      }
    })
    /*
     * The state must not be carried by colour alone, which is the other reason the
     * glyphs are there: someone who cannot tell amber from red should still be able
     * to tell "changes waiting" from "synced".
     */
    check(
      'the sync state is a shape, not only a colour',
      syncInk.size[0] <= 12 && syncInk.size[1] <= 12 && syncInk.glyph.trim() !== '',
      JSON.stringify(syncInk),
    )
    const controlsChildren = await page.evaluate(() =>
      [...document.querySelector('.app-header-controls').children].map((child) =>
        child.tagName === 'A'
          ? child.getAttribute('aria-label')?.startsWith('Sync:')
            ? 'Sync'
            : child.getAttribute('aria-label') || child.textContent.trim()
          : child.tagName,
      ),
    )
    check(
      'the header line reads Document, sync, settings, then About',
      JSON.stringify(controlsChildren) ===
        JSON.stringify(['Document', 'Sync', 'Settings', 'About']),
      JSON.stringify(controlsChildren),
    )
    check(
      'Document is styled as a link, not a button',
      (await page
        .locator('.app-header-controls a[href="#/document"]')
        .evaluate((el) => el.classList.contains('button'))) === false,
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

    // The document is the tall scrolling thing; the controls are a short list beside
    // it. Stacked, they pushed the top of the document off screen.
    await go(page, origin, '/document')
    await page.locator('.document-page').waitFor()
    const columns = await page.evaluate(() => {
      const sidebar = document.querySelector('.document-controls').getBoundingClientRect()
      const paper = document.querySelector('.document-paper').getBoundingClientRect()
      // Right-hand rail: it starts after the paper ends, not before it starts.
      return { beside: paper.right <= sidebar.left + 1, overlap: sidebar.left < paper.right }
    })
    check(
      'the controls sit beside the document rather than above it',
      columns.beside && !columns.overlap,
      JSON.stringify(columns),
    )
    check(
      'the profile selector is in the sidebar',
      (await page.locator('.document-sidebar #document-profile').count()) === 1,
    )
    check(
      'the content card is in the sidebar',
      (await page.locator('.document-sidebar .document-content').count()) === 1,
    )
    // It explained a preset the buttons already name, and it printed if ever missed.
    check(
      'the preset description is not on the page',
      !(await page.locator('.document-page').innerText()).includes(
        'What is sent to an employer',
      ),
    )
    await page.emulateMedia({ media: 'print' })
    const printHidden = await page.evaluate(() => {
      const hidden = (selector) => {
        const element = document.querySelector(selector)
        return element === null || getComputedStyle(element).display === 'none'
      }
      return {
        sidebar: hidden('.document-controls'),
        // The toolbar moved out of the controls container, so it needs its own rule.
        toolbar: hidden('.document-toolbar'),
        paper: !hidden('.document-paper'),
      }
    })
    check(
      'printing the document drops the sidebar and the toolbar',
      printHidden.sidebar && printHidden.toolbar && printHidden.paper,
      JSON.stringify(printHidden),
    )
    await page.emulateMedia({ media: 'screen' })

    // A record shown because "include deleted records" is on has to look like one:
    // a page of them that looks like live records reads as the current state of a
    // career rather than a record of what was removed.
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Storycheck' })
      .first()
      .getByRole('button', { name: /Hide/i })
      .click()
    await page.waitForTimeout(500)

    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    check(
      'a deleted record is not in the document by default',
      !(await page.locator('.doc-deleted').count()),
    )
    // Already expanded: clicking the summary here would close it.
    await page.locator('.document-includes input[type=checkbox]').nth(5).check()
    await page
      .locator('.doc-deleted')
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => undefined)
    const marked = await page.evaluate(() => {
      const element = document.querySelector('.doc-deleted')
      if (element === null) return null
      const style = getComputedStyle(element)
      return {
        count: document.querySelectorAll('.doc-deleted').length,
        // Colour alone is not enough: most printers drop it.
        rule: style.borderLeftWidth,
        body: getComputedStyle(document.body).color,
      }
    })
    check(
      'including deleted records marks them',
      marked !== null && marked.count > 0,
      JSON.stringify(marked),
    )
    check(
      'a marked record carries a rule, so it survives a printer that drops colour',
      marked !== null && parseFloat(marked.rule) > 0 && marked.rule !== marked.body,
      marked === null ? 'none' : `${marked.rule} vs ${marked.body}`,
    )

    // The awards and education table has no column titles: each row is year,
    // institution, what, in the same order, and a header naming them costs a line
    // on every page for a table the eye reads without it.
    const awardTable = await page.evaluate(() => {
      const table = document.querySelector('.doc-award-table')
      if (table === null) return { present: false, titles: [] }
      return {
        present: true,
        titles: [...table.querySelectorAll('th')].map((th) => th.textContent.trim()),
        columns: table.querySelectorAll('tbody tr:first-child td').length,
      }
    })
    check(
      'the awards and education table has no column titles',
      !awardTable.present || (awardTable.titles.length === 0 && awardTable.columns === 3),
      JSON.stringify(awardTable),
    )

    // The edit-all page's toggles have to change what it prints, not merely exist:
    // it claims to print the document, and the document is what these control.
    await createInEditor(page, origin, {
      section: 'Work history',
      label: 'job',
      expect: 'Toggle Co',
      fields: {
        Company: 'Toggle Co',
        'Job title': 'Toggle Role',
        'Start date': '2020-01-01',
        Story: 'A distinctive story that the preset leaves out.',
      },
    })

    // Awards and education had no preview at all, so their stories could not
    // appear whatever the toggle said.
    // Awards and education are created from the editor; their standalone routes
    // are gone. These carry stories, to check they follow the stories toggle.
    for (const [section, label, fields, expect] of [
      [
        'Awards',
        'award',
        { Year: '2024', Institution: 'Prize Body', What: 'Best thing', Story: 'AWARD-STORY' },
        'Prize Body',
      ],
      [
        'Education',
        'education',
        {
          Year: '2016',
          Institution: 'A Degree Institution',
          What: 'A Degree',
          Story: 'EDUCATION-STORY',
        },
        // Distinct from the education entry created earlier in this run: with the
        // same institution, the wait after saving would match that older row and
        // pass without anything having been created.
        'A Degree Institution',
      ],
    ]) {
      const created = await createInEditor(page, origin, { section, label, fields, expect })
      check(`a ${label} can be created from the editor`, created === true)
    }

    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    // `evaluate` rather than `locator.innerText()`: the pane is long by now, and
    // innerText waits for stability while the editor is still closing.
    const paneText = () =>
      page.evaluate(() => document.querySelector('.all-in-one-content')?.innerText ?? '')
    const editPrint = () => page.locator('.all-in-one-print .doc').innerText()
    const stories = () =>
      page.locator('.document-sidebar .document-includes input[type=checkbox]').nth(3)

    // The pane and the print agree: the toggles decide both. Each type used to
    // pick its own preview — jobs showed responsibilities, achievements and
    // categories showed their story — so "some stories are shown, some are not"
    // was the rule being absent rather than one type being wrong.
    check(
      'the edit-all pane leaves the story out under the CV preset',
      !(await paneText()).includes('A distinctive story'),
    )
    await stories().check()
    await page.waitForTimeout(300)
    check(
      'the edit-all pane honours Include stories',
      (await paneText()).includes('A distinctive story'),
    )
    // The responsibilities and the story are two blocks, not one sentence that
    // runs on: a job is the one record that carries both, and joined with a space
    // they read as a single claim about the role.
    // The story must be its own paragraph rather than text appended to the
    // responsibilities — appended, it reads as part of what the role did.
    const jobPreviewBlocks = await page.evaluate(() => {
      const job = [...document.querySelectorAll('.all-in-one-content .inline-row')].find((r) =>
        r.innerText.includes('Toggle Role'),
      )
      if (job === undefined) return { found: false, tag: null, ownBlock: false, italic: null }
      const preview = job.querySelector('.inline-row-preview')
      const story = preview === null ? null : preview.querySelector('.inline-row-story')
      return {
        found: true,
        tag: story === null ? null : story.tagName,
        ownBlock: story !== null && story.parentElement === preview,
        italic: story === null ? null : getComputedStyle(story).fontStyle,
      }
    })
    check(
      'a story is its own block, not part of the responsibilities',
      jobPreviewBlocks.found && jobPreviewBlocks.tag === 'P' && jobPreviewBlocks.ownBlock,
      JSON.stringify(jobPreviewBlocks),
    )
    check(
      'a story is italic, matching the document',
      jobPreviewBlocks.italic === 'italic',
      JSON.stringify(jobPreviewBlocks),
    )
    check(
      'the edit-all page honours Also include when printing',
      (await editPrint()).includes('A distinctive story'),
    )
    // Awards and education had no preview at all, so their stories could not
    // appear whatever the toggle said.
    check(
      'award and education stories are shown while stories are included',
      (await paneText()).includes('AWARD-STORY') &&
        (await paneText()).includes('EDUCATION-STORY'),
    )

    // A question's answer is a story for this purpose: it is the prepared text
    // that only an interview document should carry.
    // Added from the editor, where the category's own button does it.
    await go(page, origin, '/interview')
    await page.locator('.questions-page').waitFor()
    // Navigating here re-mounted the page, which resets the toggle to the CV
    // preset's own options.
    await stories().check()
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Behavioural' })
      .first()
      .getByRole('link', { name: 'Add question' })
      .click()
    await page.locator('.record-form').waitFor()
    await page.getByLabel('Question', { exact: true }).fill('Why this role?')
    await page.getByLabel('Answer', { exact: true }).fill('A prepared answer.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Why this role?' })
      .first()
      .waitFor({ timeout: 10000 })

    // `evaluate` rather than `locator.innerText()`: the pane is long by now, and
    // innerText on it waits on the element being stable while the editor closes.
    const answerVisible = () =>
      page.evaluate(
        () =>
          document
            .querySelector('.all-in-one-content')
            ?.innerText.includes('A prepared answer.') ?? false,
      )
    // Stories are on from the toggle above.
    check('an answer is shown while stories are included', await answerVisible())
    await stories().uncheck()
    await page.waitForTimeout(300)
    check('hiding stories hides the answer too', (await answerVisible()) === false)
    check(
      'hiding stories hides the award and education stories too',
      !(await paneText()).includes('AWARD-STORY') &&
        !(await paneText()).includes('EDUCATION-STORY'),
    )

    // Tombstones were always listed, so Show deleted could not change anything.
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Toggle Co' })
      .first()
      .getByRole('button', { name: /Hide/i })
      .click()
    await page.waitForTimeout(500)
    await page.locator('.all-in-one').waitFor()
    const paneHas = async () =>
      (await page.locator('.all-in-one-content').innerText()).includes('Toggle Co')
    check(
      'a deleted record is out of the edit-all pane by default',
      (await paneHas()) === false,
    )
    await page
      .locator('.document-sidebar .document-includes input[type=checkbox]')
      .nth(5)
      .check()
    await page.waitForTimeout(300)
    const row = page.locator('.all-in-one-content .inline-row').filter({ hasText: 'Toggle Co' })
    const isMarked = await row.first().evaluate((n) => n.classList.contains('is-deleted'))
    check(
      'Show hidden brings it back, marked as hidden',
      (await paneHas()) === true && isMarked === true,
      String(isMarked),
    )

    /*
     * The word on the page is "hide", not "delete".
     *
     * A record is not deleted — it is hidden, and it is still there, which is
     * what the Recover button on the row is for. Saying "delete" and then
     * offering to undo it is the language of an action the app does not take.
     */
    check(
      'the row is marked hidden rather than deleted',
      // The text as it is written, not as the badge renders it: the badge is
      // uppercased in CSS, and this is about the word.
      (await row.first().locator('.badge').textContent())?.trim() === 'hidden',
      await row.first().locator('.badge').textContent(),
    )
    check(
      'and the undo message says hidden too',
      ((await page.locator('.undo-bar').innerText()) ?? '').includes('Hidden'),
      await page.locator('.undo-bar').innerText(),
    )

    /*
     * A deleted record can be brought back.
     *
     * The button that deleted it is replaced by one that recovers it, so the
     * control that undoes the mistake is the one under the pointer.
     */
    const deletedRow = row.first()
    check(
      'a deleted record offers to be recovered rather than deleted again',
      (await deletedRow.getByRole('button', { name: 'Recover', exact: true }).count()) === 1 &&
        (await deletedRow.getByRole('button', { name: 'Hide', exact: true }).count()) === 0,
      await deletedRow
        .locator('.inline-row-actions button')
        .allInnerTexts()
        .then((texts) => texts.join(',')),
    )
    await deletedRow.getByRole('button', { name: 'Recover', exact: true }).click()
    await page.waitForTimeout(700)
    check(
      'recovering it brings it back into the list',
      (await paneHas()) === true &&
        (await deletedRow.evaluate((n) => n.classList.contains('is-deleted'))) === false,
      'the row should no longer be marked as deleted',
    )
    check(
      'and it is a live record again, with the delete button back',
      (await deletedRow.getByRole('button', { name: 'Hide', exact: true }).count()) === 1,
    )
    // And the toggle is per-page state, not stored: it decides what this screen
    // prints, not what the document page prints.
    check(
      'the edit-all page also offers the label for the card',
      // The title is uppercased in CSS, so the comparison is on the words.
      (await page.locator('.document-content-title').innerText()).toLowerCase() === 'content',
    )

    /*
     * A button's label has to stay readable while the pointer is on it.
     *
     * The primary buttons are the accent colour with the accent's own text
     * colour, and the generic hover changed the background without changing the
     * text — so the label went white on near-white, and near-black on near-black
     * in the dark theme, exactly when the pointer was on the button.
     */
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    const addJob = page
      .locator('.inline-section')
      .filter({ has: page.locator('h2', { hasText: 'Work history' }) })
      .getByRole('link', { name: 'Add job', exact: true })
      .first()
    const atRest = await contrastRatio(addJob)
    await addJob.hover()
    await page.waitForTimeout(150)
    const onHover = await contrastRatio(addJob)
    check(
      'a primary button is readable at rest',
      atRest >= 4.5,
      `contrast ${atRest.toFixed(2)}`,
    )
    check(
      'and stays readable under the pointer',
      onHover >= 4.5,
      `contrast ${onHover.toFixed(2)}`,
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
