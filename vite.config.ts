import { copyFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

/**
 * Base path for the built site.
 *
 * Derived from the package name so a project site at `/<repo>/` works with no
 * configuration, with an override for a user or organisation site served from
 * the root. Deriving it rather than writing it out means renaming the repository
 * does not require editing source, and no host name is ever baked in.
 *
 * A wrong base path is the single most expensive mistake in this project: it
 * produces a completely green build that serves a blank page. That is why the
 * e2e smoke test asserts against the *served* site rather than the build output,
 * and why DEP1 has CI copy `index.html` to `404.html` as a second line of defence.
 */
const pkgName = (await import('./package.json', { with: { type: 'json' } })).default.name
const base = process.env['VITE_BASE_PATH'] ?? `/${pkgName}/`

/**
 * Emit `404.html` alongside `index.html`.
 *
 * GitHub Pages performs no request rewriting, so a deep link is a real request
 * for a path that does not exist. Hash routing is what actually makes deep links
 * work (DEP3 R1); this is defence in depth, so a later change that reintroduces
 * path routing still resolves instead of hard-404-ing.
 */
function pagesSpaFallback() {
  return {
    name: 'pages-spa-fallback',
    apply: 'build' as const,
    closeBundle() {
      const outDir = resolve(import.meta.dirname, 'dist')
      const index = resolve(outDir, 'index.html')
      if (existsSync(index)) {
        copyFileSync(index, resolve(outDir, '404.html'))
      }
    },
  }
}

/**
 * Origins the app is permitted to talk to.
 *
 * SEC1 allows the Dropbox API hosts and nothing else, so these are the only
 * hostnames permitted to appear in `connect-src`. They are duplicated from
 * `src/sync/dropbox/config.ts` on purpose: a build script cannot import
 * application source without dragging TypeScript into the config loader, and a
 * second copy that a test can compare is safer than one that has silently
 * drifted. `e2e/smoke.mjs` asserts the served policy against this list.
 *
 * The assistant's provider is not here, and that is deliberate: the assistant
 * is not in this release (see `src/ai/enabled.ts`), and a permission the app
 * does not need is a channel out of the user's document that does not have to
 * be closed. The code for the feature is still in the bundle, so it is still
 * named there — but the policy will not let it reach anything.
 */
const CSP_CONNECT_ORIGINS = ['https://api.dropboxapi.com', 'https://content.dropboxapi.com']

/**
 * SHA-256 of each inline script's text, as CSP source expressions.
 *
 * The theme bootstrap in `index.html` has to be inline: it runs before any module
 * is fetched, because reading the stored preference cannot be awaited and
 * painting first would flash the wrong theme. Rather than pay for
 * `script-src 'unsafe-inline'` — which would let an injected string execute,
 * defeating most of what the policy is for — the inline script is allow-listed by
 * content hash, which stays correct for as long as the script is not edited.
 *
 * Computing the hashes from the emitted HTML rather than copying them here means
 * the allow-list cannot fall out of step with the script it describes. CSP hashes
 * the element's text content exactly as emitted, so leading whitespace is part of
 * the input and must not be trimmed.
 */
function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  // `<script>` with no `src`. The negative lookahead keeps external module
  // scripts out; Vite has already rewritten those to hashed asset URLs by the
  // time this runs, and they are covered by 'self'.
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = match[1]
    if (text === undefined) continue
    hashes.push(`'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`)
  }
  return hashes
}

/**
 * Deliver SEC1 as a `<meta http-equiv>` policy.
 *
 * GitHub Pages serves static files and cannot set response headers, and a project
 * site is served from `https://<owner>.github.io/<repo>/`, so a `'self'` script
 * source correctly covers the hashed module chunks it loads. `404.html` is a copy
 * of the built `index.html`, so one insertion covers the deep-link fallback too.
 *
 * Injected at build time rather than committed to `index.html`, because the dev
 * server rewrites `index.html` on every request and injects its own inline
 * preamble for React Fast Refresh. A policy strict enough to be worth having
 * would break `npm run dev`; a policy loosened for the dev server is no policy at
 * all. The dev server's own protections apply instead.
 *
 * `frame-ancestors` is deliberately absent: CSP silently ignores it when
 * delivered via `<meta>`, so including it would read as clickjacking protection
 * that does not exist.
 */
function contentSecurityPolicy() {
  const build = (html: string): string =>
    [
      "default-src 'self'",
      // 'unsafe-inline' is required by the inline `style` attributes React sets
      // for the obsolete/deleted record treatment. That is a styling capability
      // with no access to data; the exfiltration channel SEC1 exists to close is
      // `connect-src`, which is not relaxed.
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' ${inlineScriptHashes(html).join(' ')}`,
      `connect-src 'self' ${CSP_CONNECT_ORIGINS.join(' ')}`,
      "img-src 'self' data:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      // No form is ever submitted and no third-party page is framed; the Dropbox
      // OAuth consent screen is a top-level navigation, which `form-action` does
      // not govern. Listed so that adding one of either has to remove this line.
      "form-action 'none'",
    ].join('; ')

  return {
    name: 'content-security-policy',
    apply: 'build' as const,
    transformIndexHtml: {
      // After Vite's own HTML processing, so the emitted markup — including any
      // inline script it added — is what gets hashed.
      order: 'post' as const,
      handler(html: string) {
        const meta = `<meta http-equiv="Content-Security-Policy" content="${build(html)}" />`
        // Immediately after the charset declaration and before the theme
        // bootstrap, because a `<meta>` policy only governs content parsed after
        // it. Inserting before `</head>` would leave the bootstrap uncovered and
        // lock the page into the light theme.
        return html.replace(/(<meta charset="UTF-8"[^>]*>)/i, `$1\n    ${meta}`)
      },
    },
  }
}

/**
 * The web app manifest.
 *
 * Written at build time rather than committed, because the paths in it are the
 * base path: the base is derived from the package name so a rename follows
 * automatically, and a manifest with the path written into it would not. The
 * same reason the CSP is injected at build time.
 *
 * There is no service worker with it, and there is not going to be one without
 * a decision about cache invalidation (D53). What the manifest buys is that a
 * phone can install the application: its own icon, its own window, no browser
 * chrome around it. The cost is that the installed application needs the
 * network to start — the shell is not cached — and the document itself is in
 * the phone's own storage either way.
 *
 * Served by the dev server as well, so that the manifest a developer sees is the
 * manifest that ships rather than a 404.
 */
function webAppManifest(base: string): Plugin {
  const manifest = {
    name: 'Career Management Document',
    // What fits under an icon on a home screen. The full name is 28 characters
    // and every platform truncates it somewhere around a dozen.
    short_name: 'Career Doc',
    description:
      'Your career records, and the document they make. Kept in your own browser and synced to your own Dropbox.',
    // The base path, so the application opens on the work history and the
    // manifest covers every route under it.
    start_url: base,
    scope: base,
    display: 'standalone',
    // Not locked: the document is wider than it is tall, and a phone turned on
    // its side is a phone reading a CV.
    orientation: 'any',
    background_color: '#f7f7f5',
    theme_color: '#2563eb',
    icons: [
      { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `${base}icon-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }

  const body = JSON.stringify(manifest, null, 2)

  return {
    name: 'web-app-manifest',
    /** The dev server serves it, so the file is in both places. */
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? '').split('?')[0] !== `${base}manifest.webmanifest`) {
          next()
          return
        }
        response.setHeader('content-type', 'application/manifest+json')
        response.end(body)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: body })
    },
  }
}

export default defineConfig({
  base,
  /**
   * All interfaces, not just one.
   *
   * Vite's default `host` is `localhost`, which Node resolves to `::1` on a
   * dual-stack machine and binds *IPv6 only*. A browser trying `127.0.0.1`
   * first then gets connection refused — so `npm run dev` looks broken while
   * `curl http://localhost:.../` works fine, which is a confusing failure to
   * diagnose.
   *
   * The cost is that the dev server is reachable from the local network, which
   * run.sh says outright rather than leaving implicit. A production build is
   * static and is not affected.
   */
  server: { host: true },
  plugins: [react(), contentSecurityPolicy(), webAppManifest(base), pagesSpaFallback()],
  build: {
    // Source maps are not published. This app holds personal data and there is
    // no reason to expose internals.
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    // Globals are off deliberately. With them on, `describe` and `expect` are in
    // scope for production code too, so a stray call in app code type-checks and
    // only fails at runtime. Every test imports what it uses instead.
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    // `scripts/` is included because the SQLite migration's transformations are
    // the only place a rule from spec §10.3 can be checked without a database,
    // and a rule that is only ever exercised against one real file is a rule that
    // silently stops holding when the data changes shape.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
    env: {
      // Pinned so date assertions mean the same thing everywhere. The document
      // displays month and year, so a runner's own locale must not decide what a
      // date renders as (D17, D46).
      TZ: 'Pacific/Auckland',
    },
  },
})
