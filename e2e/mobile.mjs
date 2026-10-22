/**
 * The phone interface, checked at a phone's size.
 *
 * A separate suite from `smoke.mjs` because it is a different claim. The smoke
 * suite says the app does what it should, at the size it was designed at; this
 * says the same app is *usable* at 390 pixels wide — that the section links
 * are where a thumb reaches, that nothing hides under them, that the page does
 * not scroll sideways, and that the document's controls fold away rather than
 * pushing the document off the screen.
 *
 * It runs against a real browser with a phone's viewport, touch support and
 * device pixel ratio. No phone is involved: the checks are about the layout at
 * that size, and the layout is what a phone renders.
 *
 * Run against a production build:
 *   npm run build && npm run test:mobile
 */
/* global document, getComputedStyle, Touch, TouchEvent, window */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const DIST = resolve(import.meta.dirname, '..', 'dist')

/** Must match the `base` derivation in vite.config.ts. */
const BASE_PATH = '/career-management/'

/**
 * A phone: the width of an iPhone 14 in CSS pixels, and the touch support that
 * comes with it.
 *
 * The height is the point too — a phone is tall and narrow, and a layout that
 * fits 390×844 but not 390×600 is a layout that a smaller phone does not have.
 *
 * `isMobile` is deliberately *not* set. With it, Chrome widens the layout
 * viewport to fit content that overflows — which is what a phone does when a
 * page is too wide, and it hides the overflow this suite is looking for. The
 * layout viewport is 390 pixels here whatever the content does, so an element
 * that runs off the side is an element that runs off the side.
 */
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

/**
 * The smallest a tap target may be.
 *
 * 44px is the smallest the platform guidance accepts; the stylesheet gives the
 * buttons 48px, which is a little more than that, and this is what says so.
 */
const TAP = 48

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
 * The built output, served the way GitHub Pages serves it.
 *
 * Duplicated from `smoke.mjs` and `axe.mjs` rather than shared: the suites have
 * different jobs, and a shared helper would let them agree about a mistake in
 * here. That is the same reason the CSP allow-list is written out twice.
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
      done({ server, origin: `http://127.0.0.1:${port}${BASE_PATH}` })
    })
  })
}

/** Load a route and wait for the routed view to have rendered. */
async function go(page, origin, hash) {
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.evaluate((next) => {
    globalThis.location.hash = next
  }, hash)
  await page.locator('.app-main').waitFor()
  await page
    .locator('.document-page, .all-in-one, .record-list, form, .app-main h2')
    .first()
    .waitFor()
}

/** Type into a labelled field, whatever element the field is. */
async function fill(page, label, value) {
  const control = page.getByLabel(label, { exact: true })
  const tag = await control.evaluate((node) => node.tagName.toLowerCase())
  if (tag === 'select') await control.selectOption({ label: value })
  else await control.fill(value)
}

/**
 * Enough content for the pages to have something on them.
 *
 * An empty page cannot fail a layout check in a useful way: with nothing to
 * scroll, nothing can hide under the bar, and the overlap check would pass on
 * an app that had stopped rendering anything.
 *
 * The names are long and the email is long, deliberately. A name with no
 * spaces in it has nowhere to break, and a layout that only copes with short
 * names is a layout that has been tested with the wrong data.
 */
async function seed(page, origin) {
  await go(page, origin, '/profiles')
  await page.getByRole('link', { name: 'Add profile', exact: true }).click()
  await page.locator('.record-form').waitFor()
  await fill(page, 'Name', 'Alexandra Featherstonehaugh-Montgomery')
  await fill(page, 'Title', 'Senior Engineer')
  await fill(
    page,
    'Email',
    'alexandra.featherstonehaugh.montgomery@averylongcompanydomainname.example.com',
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.record-row').first().waitFor()

  await go(page, origin, '/')
  await page.locator('.all-in-one').waitFor()
  await page
    .locator('.inline-section')
    .filter({ has: page.locator('h2', { hasText: 'Work history' }) })
    .getByRole('link', { name: 'Add job', exact: true })
    .first()
    .click()
  await page.locator('.record-form').waitFor()
  await fill(page, 'Company', 'Averylongcompanydomainname International Holdings Group')
  await fill(page, 'Start date', '2019-01-01')
  await fill(page, 'Responsibilities', 'Led the billing platform rewrite.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForTimeout(600)
}

/** The phone checks, against a seeded app. */
async function checkPhoneLayout(page, origin) {
  await go(page, origin, '/')

  const nav = page.locator('.app-nav')
  check(
    'the section links are a bar at the foot of the screen',
    (await nav.evaluate((node) => getComputedStyle(node).position)) === 'fixed',
  )

  const bar = await nav.boundingBox()
  check(
    'the bar is on the screen, at the bottom of it',
    bar !== null && Math.abs(bar.y + bar.height - PHONE.viewport.height) < 2,
    JSON.stringify(bar),
  )

  /*
   * The targets, not the text.
   *
   * 44px is the smallest a thumb hits without aiming; a link that is a line of
   * text is not a thing a finger can hit.
   */
  const heights = await nav
    .locator('a')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
  check(
    'the links in the bar are big enough to tap',
    heights.length > 0 && heights.every((height) => height >= TAP),
    JSON.stringify(heights),
  )

  /*
   * Nothing under the bar.
   *
   * The last row on the page, after scrolling to the bottom, has to be above
   * the bar rather than behind it — otherwise the last thing on the page cannot
   * be read or tapped.
   */
  await page.evaluate(() => {
    globalThis.scrollTo(0, document.body.scrollHeight)
  })
  await page.waitForTimeout(200)
  const barBox = await nav.boundingBox()
  const lastRow = await page.locator('.inline-row').last().boundingBox()
  check(
    'the last thing on the page is not under the bar',
    barBox !== null && lastRow !== null && lastRow.y + lastRow.height <= barBox.y + 1,
    JSON.stringify({ lastRow, barBox }),
  )

  /*
   * The page does not scroll sideways.
   *
   * The document's paper is wider than a phone and scrolls inside its own box;
   * the page around it does not. A sideways-scrolling page on a phone is the
   * classic mobile failure: everything is reachable, and nothing is where the
   * thumb expects it.
   */
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: window.innerWidth,
  }))
  check(
    'the page does not scroll sideways',
    overflow.page <= overflow.screen + 1,
    JSON.stringify(overflow),
  )

  await go(page, origin, '/document')
  await page.locator('.document-page').waitFor()

  /*
   * The document's controls fold away, and the document is what is left.
   *
   * On a phone the rail cannot sit beside the paper, and above the paper it
   * would push the document off the screen — so it is folded, and what the page
   * shows first is the document.
   */
  const folded = page.locator('details.document-sidebar-folded')
  check('the document controls are folded away', (await folded.count()) === 1)
  check('and they start folded', !(await folded.evaluate((node) => node.open)))
  const paper = await page.locator('.document-paper').boundingBox()
  check(
    'the document is still there, and wide enough to read',
    paper !== null && paper.width > 200,
    JSON.stringify(paper),
  )

  /*
   * The paper is wider than a phone — it is the width of the printed page — so
   * it scrolls inside its own box. The page around it must not.
   */
  const documentOverflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: window.innerWidth,
  }))
  check(
    'the document page does not scroll sideways either',
    documentOverflow.page <= documentOverflow.screen + 1,
    JSON.stringify(documentOverflow),
  )

  await folded.locator('summary').first().click()
  await page.waitForTimeout(200)
  check(
    'opening the fold reveals the controls',
    await page.locator('details.document-sidebar-folded[open] .document-actions').isVisible(),
  )

  await go(page, origin, '/jobs/new')
  await page.locator('.record-form').waitFor()
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await save.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(200)
  const saveBox = await save.boundingBox()
  const barBoxAtForm = await nav.boundingBox()
  check(
    'the save button can be reached, clear of the bar',
    saveBox !== null &&
      barBoxAtForm !== null &&
      saveBox.y + saveBox.height <= barBoxAtForm.y + 1 &&
      saveBox.y >= 0,
    JSON.stringify({ saveBox, barBoxAtForm }),
  )
  check(
    'and it is big enough to tap',
    saveBox !== null && saveBox.height >= TAP,
    JSON.stringify(saveBox),
  )

  /*
   * The buttons, all of them.
   *
   * A button sized for a pointer is a button a finger misses, and the ones that
   * matter on a phone are the small ones on each row — edit, hide, add — which
   * are the smallest buttons in the application.
   */
  const small = await page.evaluate((tap) => {
    const out = []
    for (const button of document.querySelectorAll('button, .button')) {
      const rect = button.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (rect.height < tap) {
        out.push(
          `${button.className || button.tagName} "${(button.textContent ?? '').trim().slice(0, 20)}" ${Math.round(rect.height)}px`,
        )
      }
    }
    return out.slice(0, 6)
  }, TAP)
  check('every button on the page is big enough to tap', small.length === 0, small.join(' | '))
}

/**
 * A row's controls are behind the row.
 *
 * Four buttons on every row is a screen of buttons, so on a phone they are
 * collapsed until the row is opened. Two ways in, and both are checked here:
 * a long press and a swipe.
 */
async function checkRowControlsAreBehindTheRow(page, origin) {
  await go(page, origin, '/')
  await page.locator('.all-in-one').waitFor()

  const row = page.locator('.inline-row').first()
  await row.waitFor()

  const collapsed = await row
    .locator('.inline-row-actions')
    .evaluate((node) => node.getBoundingClientRect().height)
  check('the row’s controls are collapsed to nothing', collapsed === 0, String(collapsed))

  // A long press: a finger that stays still.
  await row.evaluate((node) => {
    const touch = new Touch({ identifier: 1, target: node, clientX: 40, clientY: 40 })
    node.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touch],
        targetTouches: [touch],
        changedTouches: [touch],
      }),
    )
  })
  await page.waitForTimeout(700)
  check(
    'a long press opens them',
    (await row
      .locator('.inline-row-actions')
      .evaluate((node) => node.getBoundingClientRect().height)) > 0,
  )
  check('and the row says it is open', (await row.getAttribute('data-revealed')) === 'true')

  // A swipe: a finger that moves sideways.
  await page.reload({ waitUntil: 'networkidle' })
  await go(page, origin, '/')
  const row2 = page.locator('.inline-row').first()
  await row2.waitFor()
  await row2.evaluate((node) => {
    const make = (x) => new Touch({ identifier: 2, target: node, clientX: x, clientY: 40 })
    node.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [make(200)],
        targetTouches: [make(200)],
        changedTouches: [make(200)],
      }),
    )
    node.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [make(120)],
        targetTouches: [make(120)],
        changedTouches: [make(120)],
      }),
    )
  })
  await page.waitForTimeout(300)
  check(
    'a swipe opens them too',
    (await row2
      .locator('.inline-row-actions')
      .evaluate((node) => node.getBoundingClientRect().height)) > 0,
  )

  // A scroll must not open them: the finger moved, so it was reading.
  await page.reload({ waitUntil: 'networkidle' })
  await go(page, origin, '/')
  const row3 = page.locator('.inline-row').first()
  await row3.waitFor()
  await row3.evaluate((node) => {
    const make = (x, y) => new Touch({ identifier: 3, target: node, clientX: x, clientY: y })
    node.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [make(200, 100)],
        targetTouches: [make(200, 100)],
        changedTouches: [make(200, 100)],
      }),
    )
    node.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [make(200, 40)],
        targetTouches: [make(200, 40)],
        changedTouches: [make(200, 40)],
      }),
    )
  })
  await page.waitForTimeout(700)
  check(
    'but scrolling does not',
    (await row3
      .locator('.inline-row-actions')
      .evaluate((node) => node.getBoundingClientRect().height)) === 0,
  )
}

/**
 * The keyboard, and the print sheet.
 *
 * The two things a phone does that a laptop does not: it puts a keyboard over
 * the bottom of the screen, and it prints through the platform's own sheet
 * rather than through a dialog.
 *
 * The keyboard cannot be raised in a browser, so what is checked is the thing
 * that makes it bearable: a field that is focused is scrolled to somewhere the
 * keyboard is not. The page asks the browser to resize for the keyboard, and
 * leaves room for the bar at the foot of the screen, so the field is above
 * both.
 *
 * The print sheet cannot be raised either, so what is checked is what comes
 * out: the document, and not the editor.
 */
async function checkKeyboardAndPrint(page, origin) {
  await go(page, origin, '/jobs/new')
  await page.locator('.record-form').waitFor()

  const field = page.getByLabel('Company', { exact: true })
  await field.focus()
  await page.waitForTimeout(300)

  const focused = await field.boundingBox()
  const bar = await page.locator('.app-nav').boundingBox()
  check(
    'a focused field is above the bar at the foot of the screen',
    focused !== null && bar !== null && focused.y + focused.height <= bar.y,
    JSON.stringify({ focused, bar }),
  )
  check('and it is on the screen', focused !== null && focused.y >= 0, JSON.stringify(focused))

  const viewport = await page.evaluate(() => ({
    interactiveWidget: document
      .querySelector('meta[name="viewport"]')
      ?.getAttribute('content')
      ?.includes('interactive-widget=resizes-content'),
    scrollPadding: getComputedStyle(document.documentElement).scrollPaddingBottom,
  }))
  check(
    'the page asks the browser to make room for the keyboard',
    viewport.interactiveWidget === true,
    JSON.stringify(viewport),
  )
  check(
    'and leaves room for the bar when it scrolls something into view',
    Number.parseFloat(viewport.scrollPadding) > 0,
    JSON.stringify(viewport),
  )

  // The print sheet: what comes out of it.
  await go(page, origin, '/')
  await page.locator('.all-in-one').waitFor()
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(200)
  const printed = await page.evaluate(() => {
    const visible = (selector) => {
      const node = document.querySelector(selector)
      if (node === null) return false
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    return {
      document: visible('.all-in-one-print'),
      editor: visible('.all-in-one-content'),
      header: visible('.app-header'),
      bar: visible('.app-nav'),
    }
  })
  check(
    'printing from a phone prints the document and not the editor',
    printed.document && !printed.editor,
    JSON.stringify(printed),
  )
  check(
    'and prints neither the header nor the bar',
    !printed.header && !printed.bar,
    JSON.stringify(printed),
  )
  await page.emulateMedia({ media: 'screen' })
}

/**
 * Nothing runs off the side of the screen.
 *
 * Text with no spaces in it — an email address, a company name — has nowhere to
 * break, and a browser that is not told it may break it lets the text run past
 * the edge of the page and under the buttons beside it.
 *
 * The document's paper is excluded: it is the printed page, it is meant to be
 * wider than a phone, and it scrolls inside its own box.
 */
async function checkNothingRunsOff(page, origin) {
  const routes = ['/', '/profiles', '/interview', '/jobs/new', '/document', '/settings']
  for (const route of routes) {
    await go(page, origin, route)
    const offenders = await page.evaluate(() => {
      const screen = window.innerWidth
      const out = []
      for (const node of document.querySelectorAll('body *')) {
        const rect = node.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        if (rect.right <= screen + 1) continue
        // Skip anything inside a box that scrolls sideways on its own.
        let parent = node.parentElement
        let scrolls = false
        while (parent) {
          const overflowX = getComputedStyle(parent).overflowX
          if (overflowX === 'auto' || overflowX === 'scroll') {
            scrolls = true
            break
          }
          parent = parent.parentElement
        }
        if (scrolls) continue
        out.push(
          `${node.tagName}.${typeof node.className === 'string' ? node.className : ''} right=${Math.round(rect.right)} "${(node.textContent ?? '').trim().slice(0, 30)}"`,
        )
      }
      return out.slice(0, 5)
    })
    check(
      `nothing runs off the side of the screen on ${route}`,
      offenders.length === 0,
      offenders.join(' | '),
    )
  }
}

/**
 * The estimate is the same on a phone as on a laptop.
 *
 * The fit report measures the rendered document, so the number is only right if
 * the document is laid out at the measure it prints at. A phone is narrower than
 * the paper, and the easy mistake is to let the document be squeezed to fit the
 * screen: the text then wraps early, and the estimate counts a document nobody
 * would ever print.
 *
 * So the same document is measured at both widths and the two are compared.
 */
async function checkEstimateIsTheSame(page, origin) {
  await go(page, origin, '/document')

  const read = () =>
    page.evaluate(() => {
      const doc = document.querySelector('[data-fit-document]')
      let estimate = null
      for (const node of document.querySelectorAll('*')) {
        if (node.children.length === 0 && /Estimated \d+ page/.test(node.textContent ?? '')) {
          estimate = node.textContent?.trim() ?? null
        }
      }
      return { width: doc === null ? null : getComputedStyle(doc).width, estimate }
    })

  const onPhone = await read()
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.waitForTimeout(500)
  const onLaptop = await read()
  await page.setViewportSize(PHONE.viewport)
  await page.waitForTimeout(300)

  check(
    'the document is laid out at the same measure on a phone and on a laptop',
    onPhone.width !== null && onPhone.width === onLaptop.width,
    JSON.stringify({ onPhone, onLaptop }),
  )
  check(
    'and the estimate is the same on both',
    onPhone.estimate !== null && onPhone.estimate === onLaptop.estimate,
    JSON.stringify({ onPhone: onPhone.estimate, onLaptop: onLaptop.estimate }),
  )
}

/** The same routes, audited at the phone's size. */
async function checkAccessibility(page, origin) {
  const routes = ['/', '/document', '/interview', '/jobs/new', '/settings', '/sync']
  for (const route of routes) {
    await go(page, origin, route)
    const result = await new AxeBuilder({ page }).analyze()
    check(
      `no axe violations on ${route} at phone width`,
      result.violations.length === 0,
      result.violations.map((violation) => violation.id).join(', '),
    )
  }
}

async function main() {
  const { server, origin } = await serve()
  const browser = await chromium.launch()
  const context = await browser.newContext(PHONE)
  const page = await context.newPage()

  try {
    await seed(page, origin)
    await checkPhoneLayout(page, origin)
    await checkRowControlsAreBehindTheRow(page, origin)
    await checkKeyboardAndPrint(page, origin)
    await checkNothingRunsOff(page, origin)
    await checkEstimateIsTheSame(page, origin)
    await checkAccessibility(page, origin)
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} phone check(s) failed.`)
    process.exit(1)
  }

  console.log('\nAll phone checks passed.')
}

await main()
