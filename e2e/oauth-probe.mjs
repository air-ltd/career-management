/*
 * Throwaway probe: simulate the OAuth redirect landing on the app and confirm
 * the code is exchanged, the query string cleared, and the user lands on /sync
 * with a connected state. The token endpoint is mocked.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'

const DIST = 'dist',
  BASE = '/career-management/'
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

let tokenRequests = 0
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/2/files/') || req.url.includes('/2/files/')) {
    return mockFiles(req, res)
  }
  const u = new URL(req.url, 'http://l')
  let p = u.pathname
  if (!p.startsWith(BASE)) {
    res.writeHead(404).end()
    return
  }
  p = p.slice(BASE.length) || 'index.html'
  const t = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''))
  const f = existsSync(t) ? t : join(DIST, '404.html')
  const b = await readFile(f)
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' })
  res.end(b)
})

function mockFiles(req, res) {
  const u = new URL(req.url, 'http://l')
  if (u.pathname.includes('/download')) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error_summary: 'path/not_found/...' }))
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ rev: 'rev-1' }))
  })
}

await new Promise((r) => server.listen(0, '127.0.0.1', () => r()))
const { port } = server.address()
const origin = `http://127.0.0.1:${port}`

const browser = await chromium.launch()
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR ' + String(e)))
page.on('console', (m) => {
  if (m.type() !== 'error') errs.push('LOG ' + m.type() + ': ' + m.text())
})

// Simulate the landing from Dropbox: query string with a code, a pending
// verifier in sessionStorage, and the Dropbox token endpoint mocked.
// Seeded before any page script runs, so the app finds it on the very first read.
await page.addInitScript(() => {
  try {
    globalThis.sessionStorage.setItem(
      'cmd:dropbox-pending',
      JSON.stringify({
        verifier: 'a'.repeat(64),
        state: 'test-state',
        createdAt: Date.now(),
      }),
    )
  } catch (error) {
    // Session storage being unavailable is the condition the provider itself
    // reports at the start of a flow, so it is worth seeing rather than hiding.
    console.warn('could not seed the pending PKCE record:', String(error))
  }
})

// Intercept the token exchange and return a token, as Dropbox would.
await page.route('**/oauth2/token', (route) => {
  tokenRequests += 1
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: 'test-token',
      expires_in: 14400,
      account_id: 'dbid:test',
    }),
  })
})
// Serve the files endpoints from our own origin so the mock is reachable.
await page.route('**://api.dropboxapi.com/**', (route) => route.continue())
await page.route('**://content.dropboxapi.com/**', (route) => {
  const url = route.request().url()
  if (url.includes('/download')) {
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error_summary: 'path/not_found/..' }),
    })
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ rev: 'rev-1' }),
  })
})

await page.goto(`${origin}${BASE}?code=test-code&state=test-state`, {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(2500)

console.log('token exchange requests:', tokenRequests)
console.log('final URL:', page.url())
console.log('query string cleared?', !page.url().includes('code='))
console.log('header indicator:', await page.locator('.sync-indicator').innerText())
console.log(
  'page h1/h2:',
  await page
    .locator('.app-main h1, .app-main h2')
    .first()
    .innerText()
    .catch(() => '(none)'),
)
console.log(
  'sync status:',
  await page
    .locator('.sync-page')
    .innerText()
    .catch(() => '(no sync page)')
    .then((t) => t.slice(0, 160)),
)
console.log(
  'sessionStorage pending after:',
  await page.evaluate(() => globalThis.sessionStorage.getItem('cmd:dropbox-pending')),
)
console.log('errors:', errs.length === 0 ? '(none)' : errs.slice(0, 3))
await browser.close()
server.close()
