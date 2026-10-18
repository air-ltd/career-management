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
 * Create a record from the all-in-one editor, for the entities whose standalone
 * list and "new" routes were removed.
 *
 * The editor's per-section "Add" button opens the same form the removed routes
 * used, with the same field labels, so the only difference is the route. Waiting
 * on the new row in the section — not on the section heading — keeps the same
 * guarantee the list-based helper had: a save that silently did nothing fails.
 */
async function createInEditor(page, origin, { section, label, fields, expect }) {
  await go(page, origin, '/')
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
    .getByRole('button', { name: `Add ${label}` })
    .first()
  await add.waitFor()
  await add.click()
  await page.locator('.inline-editor').waitFor()

  for (const [field, value] of Object.entries(fields)) {
    await fill(page, field, value)
  }
  await page
    .locator('.inline-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click()

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
      .getByRole('button', { name: 'Add achievement' })
      .click()
    await page.locator('.inline-editor').waitFor()
    const jobOption = await page
      .getByLabel('Job', { exact: true })
      .locator('option')
      .filter({ hasText: 'Acme' })
      .count()
    check('the achievement job dropdown is populated from the saved jobs', jobOption > 0)
    await page.locator('.inline-editor').getByRole('button', { name: 'Cancel' }).click()

    check(
      'an achievement can be created',
      await createInEditor(page, origin, {
        section: 'Work history',
        label: 'achievement',
        expect: 'Shipped the thing',
        fields: { Job: 'Acme - Engineer', Achievement: 'Shipped the thing' },
      }),
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
    await createAndConfirm(page, origin, {
      path: '/jobs',
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
      // The generator emits the shorthand `14mm` for all four sides, which is the
      // form it collapses to when they are equal; the long form is accepted too so
      // this does not fail on a future change that only varies one side.
      'the page margin is 14mm on every side',
      /margin:\s*14mm(\s+14mm){0,3}\s*;/.test(pageRuleText),
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
    check(
      'the body text stays softer than the headings',
      ink.body !== 'rgb(0, 0, 0)',
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

    await page.getByLabel('Document', { exact: true }).selectOption('interview')
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
    // Scoped to the record row: the navigation contains links whose names also
    // begin "Edit", and DOM order would pick one of those instead of this one.
    await page
      .locator('.record-row')
      .filter({ hasText: 'Acme' })
      .first()
      .getByRole('link', { name: /^Edit / })
      .click()
    await page.getByRole('heading', { name: 'Edit job' }).waitFor()
    await fill(page, 'Job title', 'Staff Engineer')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const edited = page.locator('.record-row').filter({ hasText: 'Staff Engineer' }).first()
    const editedOk = await edited.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false,
    )
    check('an existing record can be edited', editedOk)

    // ------------------------------------------------------------ validation
    await go(page, origin, '/jobs/new')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    check(
      'a required field blocks saving and says why',
      (await page.locator('.form-error').count()) > 0,
    )

    // ------------------------------------------------------------- all in one
    // The single-page editor: every section on one page, forms opening in place.
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
      'the all-in-one page shows every section',
      ['Profiles', 'Work history', 'Awards', 'Education', 'Question categories'].every((name) =>
        sections.includes(name),
      ),
      JSON.stringify(sections),
    )
    check(
      'nothing is expanded by default',
      (await page.locator('.inline-editor').count()) === 0,
      'forms should mount only when opened',
    )
    check(
      'achievements are grouped under their job',
      (await page.locator('.inline-children').count()) > 0,
    )
    check(
      'no achievement or question counts are shown',
      (await page.locator('.inline-children-label').count()) === 0,
    )
    check(
      'a parent with no children shows no empty-state box at all',
      (await page
        .locator('.inline-row')
        .filter({ hasText: 'Behavioural' })
        .first()
        .locator('.inline-children')
        .count()) === 0,
    )
    const jobRow = page.locator('.inline-row').filter({ hasText: 'Acme' }).first()
    check(
      'the job responsibilities are readable without opening the record',
      (await jobRow.locator('.inline-row-preview').innerText()).includes('Did things'),
    )
    check(
      '"add achievement" sits beside the job Edit button',
      (await jobRow.getByRole('button', { name: 'Add achievement' }).count()) === 1 &&
        (await jobRow.getByRole('button', { name: 'Edit' }).count()) === 1,
    )

    // Adding a nested record from beside the parent button.
    await jobRow.getByRole('button', { name: 'Add achievement' }).click()
    await page
      .locator('.inline-editor')
      .filter({ hasText: 'Add achievement' })
      .getByRole('heading', { name: 'Add achievement' })
      .waitFor()
    await page.getByLabel('Achievement', { exact: true }).last().fill('NESTED_FROM_PARENT')
    await page
      .locator('.inline-editor')
      .filter({ hasText: 'Add achievement' })
      .getByRole('button', { name: 'Save', exact: true })
      .click()
    await page
      .locator('.inline-row-heading')
      .filter({ hasText: 'NESTED_FROM_PARENT' })
      .first()
      .waitFor({ timeout: 10000 })
    check('a nested record can be added from beside its parent', true)
    // The bug this caught: the nested add form is pre-filled with its parent, so
    // it looked like an existing record and saved under an empty id.
    check(
      'the nested add form is titled Add, not Edit',
      (await page.locator('.inline-editor h2').count()) === 0 ||
        (await page.locator('.inline-editor h2').first().innerText()).startsWith('Add'),
    )
    // The inline row's Edit expands in place and carries no href, so the id is
    // read from the row's own data attribute instead — which is the same value
    // the record was saved under, so this still catches an empty id.
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
      .getByRole('button', { name: 'Edit' })
      .click()
    await page.getByRole('heading', { name: 'Edit job' }).waitFor()
    await fill(page, 'Job title', 'Principal Engineer')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page
      .locator('.inline-row-heading')
      .filter({ hasText: 'Principal Engineer' })
      .first()
      .waitFor({ timeout: 10000 })
    check('a record can be edited in place on the all-in-one page', true)

    // Adding from the all-in-one page reaches the separate list view too.
    const awardsSection = page.locator('.inline-section').filter({ hasText: 'Awards' })
    await awardsSection.getByRole('button', { name: /Add award/ }).click()
    await awardsSection.getByRole('heading', { name: 'Add award' }).waitFor()
    await fill(page, 'Year', '2011')
    await fill(page, 'Institution', 'Institute of Something')
    await fill(page, 'What', 'Fellowship')
    // Scoped to the section: other editors are still open on the page, and each
    // has its own Save. Several can be open at once by design.
    await awardsSection.getByRole('button', { name: 'Save', exact: true }).click()
    // The form closes on save; waiting for that is what proves the save ran,
    // rather than navigating away mid-write and finding nothing there.
    await awardsSection
      .getByRole('heading', { name: 'Add award' })
      .waitFor({ state: 'detached', timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
      .then((closed) => {
        check('saving on the all-in-one page closes the form', closed)
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
        count: document.querySelectorAll('.document-print button').length,
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
        return first !== null && first.classList.contains('document-print')
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
      'Also include starts expanded, and can still be collapsed',
      (await page.evaluate(() => {
        const details = document.querySelector('.document-options')
        const wasOpen = details.open
        details.open = false
        const collapsed = details.open === false
        details.open = wasOpen
        return wasOpen === true && collapsed
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
        alsoIncludeOpen: document.querySelector('.document-options').open,
        presets: [...document.querySelectorAll('#document-preset option')].map((o) =>
          o.textContent.trim(),
        ),
        toggles: [
          ...document.querySelectorAll('.document-sidebar .document-options label'),
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
      toggles: [...document.querySelectorAll('.document-sidebar .document-options label')].map(
        (l) => l.textContent.trim(),
      ),
      profile: document.querySelector('.document-sidebar #document-profile') !== null,
      alsoIncludeOpen: document.querySelector('.document-options').open,
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
      (await page.locator('.all-in-one .document-sidebar input[type=checkbox]').count()) === 3,
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
    check(
      'the printed output is the formatted document',
      printed.hasHeader && printed.sections > 0 && printed.editorRows === 0,
      JSON.stringify(printed),
    )
    await page.emulateMedia({ media: 'screen' })

    // ----------------------------------------------------------------- delete
    // After the all-in-one checks, which need this job alive: deleted records are
    // no longer listed there by default.
    await go(page, origin, '/jobs')
    await page
      .locator('.record-row')
      .filter({ hasText: 'Principal Engineer' })
      .first()
      .getByRole('button', { name: /Delete/ })
      .click()
    // Wait for the row to detach rather than counting straight after the click:
    // an immediate count is taken before React re-renders and would pass against
    // a delete that never happened.
    const goneFromList = await page
      .locator('.record-row')
      .filter({ hasText: 'Principal Engineer' })
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
      .filter({ hasText: 'Principal Engineer' })
      .first()
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      )
    check('a deleted record is still findable behind "show deleted" (D51)', stillFindable)

    // ------------------------------------------------------------- profile
    // Picking a profile from the document page, where its effect is visible.
    await go(page, origin, '/profiles/new')
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

    // And the choice persists to the settings page, which is the same record.
    await go(page, origin, '/settings')
    check(
      'the choice is stored, not local to the document page',
      (await page.getByLabel('Profile used in the document header').inputValue()) !== '',
    )

    await go(page, origin, '/settings')
    check(
      'the settings picker offers no None option either',
      (await page
        .getByLabel('Profile used in the document header')
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
    await go(page, origin, '/jobs/new')
    await fill(page, 'Company', 'Storycheck')
    await fill(page, 'Job title', 'Role')
    await fill(page, 'Start date', '2019-01-01')
    await fill(page, 'Responsibilities', 'RESPONSIBILITIES_TEXT')
    await fill(page, 'Story', 'JOB_STORY_TEXT')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('.record-row').filter({ hasText: 'Storycheck' }).first().waitFor()

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
    await page.getByLabel('Document', { exact: true }).selectOption('interview')
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
      'the navigation offers only Profiles, Jobs and Questions',
      JSON.stringify(await page.locator('.app-nav a').allInnerTexts()) ===
        JSON.stringify(['Profiles', 'Jobs', 'Questions']),
      JSON.stringify(await page.locator('.app-nav a').allInnerTexts()),
    )
    for (const removed of ['/achievements', '/awards', '/education']) {
      await go(page, origin, removed)
      check(
        `the ${removed} list page is gone`,
        (await page.locator('.app-main').innerText()).includes('Nothing is routed at'),
      )
    }

    // Delete and undo from the editor (U5). The same behaviour as the list views:
    // a delete that cannot be taken back is how a tombstone becomes data loss.
    await go(page, origin, '/jobs/new')
    await page.getByLabel('Company', { exact: true }).fill('Deletable Co')
    await page.getByLabel('Start date', { exact: true }).fill('2020-01-01')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('.record-row').first().waitFor()

    await go(page, origin, '/')
    const deletable = () =>
      page.locator('.all-in-one-content .inline-row').filter({ hasText: 'Deletable Co' })
    await deletable().first().getByRole('button', { name: 'Delete', exact: true }).click()
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
    // A status you are watching should not move while you watch it, and a label
    // sized to its own text will: the bubble is fixed-width for the longest label
    // and the shorter ones sit centred inside it.
    const bubble = await page.evaluate(() => {
      const badge = document.querySelector('.sync-indicator .badge')
      const style = getComputedStyle(badge)
      const widths = []
      for (const label of [
        'Not connected',
        'Synced',
        'Syncing…',
        'Sync problem',
        'Changes waiting',
      ]) {
        badge.textContent = label
        widths.push(Math.round(badge.getBoundingClientRect().width))
      }
      return { widths, align: style.textAlign }
    })
    check(
      'the sync indicator keeps the same width as its label changes',
      new Set(bubble.widths).size === 1,
      `widths: ${bubble.widths.join(', ')}`,
    )
    check(
      'the sync indicator centres its text',
      bubble.align === 'center',
      `text-align: ${bubble.align}`,
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
      'Also include is in the sidebar',
      (await page.locator('.document-sidebar .document-options').count()) === 1,
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
    await go(page, origin, '/jobs')
    await page
      .locator('.record-row')
      .filter({ hasText: 'Storycheck' })
      .first()
      .getByRole('button', { name: /Delete/i })
      .click()
    await page.waitForTimeout(500)

    await go(page, origin, '/document')
    await page.locator('.doc').waitFor()
    check(
      'a deleted record is not in the document by default',
      !(await page.locator('.doc-deleted').count()),
    )
    // Already expanded: clicking the summary here would close it.
    await page.locator('.document-options input[type=checkbox]').nth(2).check()
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
    await go(page, origin, '/jobs/new')
    await page.getByLabel('Company', { exact: true }).fill('Toggle Co')
    await page.getByLabel('Job title', { exact: true }).fill('Toggle Role')
    await page.getByLabel('Start date', { exact: true }).fill('2020-01-01')
    await page
      .getByLabel('Story', { exact: true })
      .fill('A distinctive story that the preset leaves out.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('.record-row').first().waitFor()

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
      page.locator('.document-sidebar .document-options input[type=checkbox]').nth(0)

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
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    // Navigating here re-mounted the page, which resets the toggle to the CV
    // preset's own options.
    await stories().check()
    await page
      .locator('.inline-row')
      .filter({ hasText: 'Behavioural' })
      .first()
      .getByRole('button', { name: 'Add question' })
      .click()
    await page.getByLabel('Question', { exact: true }).fill('Why this role?')
    await page.getByLabel('Answer', { exact: true }).fill('A prepared answer.')
    await page
      .locator('.inline-editor')
      .getByRole('button', { name: 'Save', exact: true })
      .click()
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
    await go(page, origin, '/jobs')
    await page
      .locator('.record-row')
      .filter({ hasText: 'Toggle Co' })
      .first()
      .getByRole('button', { name: /Delete/i })
      .click()
    await page.waitForTimeout(500)
    await go(page, origin, '/')
    await page.locator('.all-in-one').waitFor()
    const paneHas = async () =>
      (await page.locator('.all-in-one-content').innerText()).includes('Toggle Co')
    check(
      'a deleted record is out of the edit-all pane by default',
      (await paneHas()) === false,
    )
    await page
      .locator('.document-sidebar .document-options input[type=checkbox]')
      .nth(2)
      .check()
    await page.waitForTimeout(300)
    const row = page.locator('.all-in-one-content .inline-row').filter({ hasText: 'Toggle Co' })
    const isMarked = await row.first().evaluate((n) => n.classList.contains('is-deleted'))
    check(
      'Show deleted brings it back, marked as deleted',
      (await paneHas()) === true && isMarked === true,
      String(isMarked),
    )
    // And the toggle is per-page state, not stored: it decides what this screen
    // prints, not what the document page prints.
    check(
      'the edit-all page also offers the label for the card',
      (await page.locator('.document-options summary').innerText()) === 'Also include',
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
