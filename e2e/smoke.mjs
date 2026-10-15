/**
 * Browser smoke test.
 *
 * Exists because of one specific, expensive failure: a wrong base path produces
 * a completely green build and a completely blank page. Every other check in CI
 * passes. Only a real browser against the *served* site catches it.
 *
 * It also asserts the served Content-Security-Policy, because the policy is
 * injected at build time and a build that quietly stopped injecting it would
 * still look healthy.
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
  '.json': 'application/json',
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

/**
 * A static server that mounts `dist` under BASE_PATH, and serves the deep-link
 * fallback the way GitHub Pages does (unknown paths return 404.html).
 */
function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    let path = decodeURIComponent(url.pathname)

    if (!path.startsWith(BASE_PATH)) {
      response.writeHead(404).end('not found')
      return
    }
    path = path.slice(BASE_PATH.length) || 'index.html'

    // Refuse to walk out of dist.
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
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(String(error)))

    // --- the app actually renders -----------------------------------------
    const response = await page.goto(`${origin}${BASE_PATH}`, { waitUntil: 'networkidle' })
    check(
      'the root page is served',
      response?.status() === 200,
      `status ${String(response?.status())}`,
    )

    const heading = await page.locator('h1').first().textContent()
    check(
      'the app rendered, rather than serving a blank page',
      Boolean(heading && heading.includes('Career Management Document')),
      `h1 was ${JSON.stringify(heading)}`,
    )

    check('the mount point has content', (await page.locator('#root > *').count()) > 0)

    // --- assets resolve under the base path --------------------------------
    const scriptSrcs = await page
      .locator('script[src]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')))
    check(
      'every script is served under the base path',
      scriptSrcs.every((src) => src === null || src.startsWith(BASE_PATH)),
      JSON.stringify(scriptSrcs),
    )

    // --- the Content Security Policy --------------------------------------
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content')
    check('a CSP is present', csp !== null)
    check(
      'connect-src lists only the Dropbox hosts (SEC1)',
      csp !== null &&
        csp.includes('connect-src') &&
        csp.includes('https://api.dropboxapi.com') &&
        csp.includes('https://content.dropboxapi.com') &&
        // Nothing else may appear after connect-src's value.
        !/connect-src[^;]*\bhttps?:\/\/(?!api\.dropboxapi\.com|content\.dropboxapi\.com)['\s]/.test(
          csp,
        ),
      csp ?? 'absent',
    )
    check('object-src is none', csp !== null && csp.includes("object-src 'none'"))

    // --- no script or network errors --------------------------------------
    check(
      'the page loaded without console or script errors',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '),
    )

    // --- the deep link actually routes -------------------------------------
    // Navigating to a fragment is a same-document navigation, so there is no HTTP
    // response to check: the thing worth asserting is that the route *rendered*.
    // This is also the check that proves hash routing works at all, which is what
    // makes deep links viable on GitHub Pages.
    await page.goto(`${origin}${BASE_PATH}#/jobs`, { waitUntil: 'networkidle' })
    const jobsHeading = await page.locator('h2').first().textContent()
    check(
      'a deep link routes to the right view',
      jobsHeading !== null && jobsHeading.trim() === 'Jobs',
      `h2 was ${JSON.stringify(jobsHeading)}`,
    )

    await page.goto(`${origin}${BASE_PATH}#/awards`, { waitUntil: 'networkidle' })
    const awardsHeading = await page.locator('h2').first().textContent()
    check('routing again reaches a different view', awardsHeading?.trim() === 'Awards')

    // --- the 404 fallback -------------------------------------------------
    const missing = await page.goto(`${origin}${BASE_PATH}not-a-real-page`, {
      waitUntil: 'networkidle',
    })
    check('a missing path falls back rather than hard-404-ing', missing?.status() === 200)
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} smoke check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll smoke checks passed.')
}

await main()
