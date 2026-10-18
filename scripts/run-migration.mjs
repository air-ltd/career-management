/**
 * Run `scripts/migrate-sqlite.ts`.
 *
 * A separate file rather than an npm script entry, because Node's TypeScript
 * support cannot resolve extensionless relative imports — the migration script
 * imports the app's own schema (`src/export/envelope`), and that module's
 * imports are written the way the bundler expects. Vite resolves them.
 *
 * The root comes from this file's own location rather than the caller's working
 * directory, so the script behaves the same from `npm run migrate:sqlite` and
 * from anything else that invokes it.
 */
import { createServer } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '..')

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  configFile: false,
})

try {
  const script = resolve(root, 'migrate-sqlite.ts')
  await server.ssrLoadModule(script)
  // `main()` reads process.argv itself and chooses its own exit code.
  await server.close()
} catch (error) {
  await server.close()
  throw error
}
