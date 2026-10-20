/**
 * Accessibility, by axe, on every route.
 *
 * Separate from `smoke.mjs` because it is a different kind of claim. The smoke suite
 * says the app does what it should; this says nothing about whether it is
 * *reachable*, which is a property of the markup and cannot be established by
 * checking that a button responds to a click.
 *
 * It found three things the rest of the suite could not, all invisible to a sighted
 * user and all present on every page:
 *
 *   - the home link's `aria-label` did not contain its visible text, so saying what
 *     is on screen could not activate it;
 *   - a job title was an `h3` following the document's `h1`, skipping a level, on
 *     the CV only -- the interview preset had an `h2` above it;
 *   - the sync log's warning text was the same amber as its borders, 1.86:1 against
 *     white, so the one line a user most needs to read was the least legible.
 *
 * Content is created first, deliberately. A page with nothing on it has nothing to
 * violate, so an audit run against empty states passes on an app that has stopped
 * rendering anything at all.
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const DIST = join(import.meta.dirname, '..', 'dist')
const BASE_PATH = '/career-management/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

/**
 * The built output, served the way GitHub Pages serves it.
 *
 * Duplicated from `smoke.mjs` rather than shared: the two suites have different jobs
 * and would otherwise agree about a mistake in here, which is the same reason the CSP
 * allow-list is written out twice instead of imported.
 */
function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let path = url.pathname
    if (!path.startsWith(BASE_PATH)) {
      res.writeHead(404).end()
      return
    }
    path = path.slice(BASE_PATH.length) || 'index.html'
    const target = join(DIST, normalize(path).replace(/^(\.\.[/\\])+/, ''))
    const file = existsSync(target) ? target : join(DIST, '404.html')
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, origin: `http://127.0.0.1:${String(address.port)}${BASE_PATH}` })
    })
  })
}

/** Load a route. The hash router means one document serves every route. */
async function go(page, origin, route) {
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.evaluate((next) => {
    globalThis.location.hash = next
  }, route)
  await page.waitForTimeout(500)
}

/** Type into a labelled field, whatever element the field is. */
async function fill(page, label, value) {
  const control = page.getByLabel(label, { exact: true })
  const tag = await control.evaluate((node) => node.tagName.toLowerCase())
  if (tag === 'select') await control.selectOption({ label: value })
  else await control.fill(value)
}

/** Every route that renders a page of its own. */
const ROUTES = [
  '/',
  '/document',
  '/interview',
  '/jobs/new',
  '/profiles',
  '/questions',
  '/settings',
  '/sync',
]

const failures = []

/**
 * Enough content for every section to render.
 *
 * An empty page cannot fail an accessibility check in a useful way, so the audit
 * would pass on an app that had stopped rendering anything.
 */
async function seed(page, origin) {
  await go(page, origin, '/profiles/new')
  await fill(page, 'Name', 'Ada Lovelace')
  await fill(page, 'Title', 'Senior Engineer')
  await fill(page, 'Email', 'ada@example.com')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.record-row').first().waitFor()

  await go(page, origin, '/')
  await page.locator('.all-in-one').waitFor()
  await page
    .locator('.inline-section')
    .filter({ has: page.locator('h2', { hasText: 'Work history' }) })
    .getByRole('button', { name: 'Add job' })
    .first()
    .click()
  await page.locator('.inline-editor').waitFor()
  await fill(page, 'Company', 'Alpha Systems')
  await fill(page, 'Start date', '2019-01-01')
  await fill(page, 'Responsibilities', 'Led the billing platform rewrite.')
  await page
    .locator('.inline-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await page.waitForTimeout(600)

  // An achievement, so the grip it is dragged by is on the page. A control that
  // only appears once there is something to drag is a control the audit would
  // otherwise never see.
  await go(page, origin, '/')
  await page.locator('.all-in-one').waitFor()
  await page
    .locator('.inline-section')
    .filter({ has: page.locator('h2', { hasText: 'Work history' }) })
    .getByRole('button', { name: 'Add achievement' })
    .first()
    .click()
  await page.locator('.inline-editor').waitFor()
  await fill(page, 'Achievement', 'Cut the billing page load time in half.')
  await page
    .locator('.inline-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await page.waitForTimeout(600)

  // A question category, so the interview route has its own sections rather than
  // an empty state.
  await go(page, origin, '/interview')
  await page.locator('.questions-page').waitFor()
  await page
    .locator('.inline-section')
    .filter({ has: page.locator('h2', { hasText: 'Question categories' }) })
    .getByRole('button', { name: 'Add question category' })
    .first()
    .click()
  await page.locator('.inline-editor').waitFor()
  await fill(page, 'Title', 'Behavioural')
  await page
    .locator('.inline-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await page.waitForTimeout(600)
}

async function main() {
  const { server, origin } = await serve()
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await seed(page, origin)

    for (const route of ROUTES) {
      await go(page, origin, route)
      const result = await new AxeBuilder({ page }).analyze()
      for (const violation of result.violations) {
        const nodes = violation.nodes
          .slice(0, 3)
          .map((node) => {
            const why = (node.failureSummary ?? '').split('\n').slice(1).join(' ').trim()
            return `      ${node.target.join(' ')}\n        ${why}`
          })
          .join('\n')
        failures.push(
          `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${nodes}`,
        )
      }
    }
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`axe found ${failures.length} violation(s) across ${ROUTES.length} routes:\n`)
    for (const failure of failures) console.error(failure)
    process.exit(1)
  }

  console.log(`axe: no violations on ${ROUTES.length} routes.`)
}

await main()
