/**
 * The OAuth token store.
 *
 * IndexedDB, via the `secrets` table, rather than `localStorage` (SEC4).
 * `localStorage` is readable by any script running on the origin, and this is
 * the credential that grants read and write access to the user's whole document
 * folder.
 *
 * Kept opaque to its callers: this module does not know what a token looks like.
 * Only the provider parses the shape, so adding a field to `DropboxTokens` does
 * not require touching the storage layer at all.
 */

import Dexie, { type Table } from 'dexie'

interface SecretRow {
  key: string
  value: unknown
}

class SecretsDb extends Dexie {
  secrets!: Table<SecretRow, string>

  constructor() {
    super('career-management-doc-secrets')
    this.version(1).stores({ secrets: 'key' })
  }
}

const secretsDb = new SecretsDb()

/** A stable singleton key. Two clients are deliberately not supported. */
const TOKEN_KEY = 'dropbox'

/**
 * The secrets store, by name.
 *
 * One store for every credential the app holds, each under its own name, so
 * that adding a second one — the assistant's provider key — is a name rather
 * than a second database.
 *
 * The store is opaque to its callers: this module does not know what a secret
 * looks like. Only the holder of a secret parses the shape, so adding a field
 * to `DropboxTokens` does not require touching the storage layer at all.
 */
export const secrets = {
  async read(name: string): Promise<unknown> {
    const row = await secretsDb.secrets.get(name)
    return row?.value
  },

  async write(name: string, value: unknown): Promise<void> {
    await secretsDb.secrets.put({ key: name, value })
  },

  async clear(name: string): Promise<void> {
    await secretsDb.secrets.delete(name)
  },
}

export const tokenStore = {
  async read(): Promise<unknown> {
    return secrets.read(TOKEN_KEY)
  },

  async write(value: unknown): Promise<void> {
    await secrets.write(TOKEN_KEY, value)
  },

  async clear(): Promise<void> {
    await secrets.clear(TOKEN_KEY)
  },
}

/**
 * Reset for tests.
 *
 * The secrets database is a second Dexie instance, so the shared test setup
 * cannot clear it for us.
 */
export async function clearTokenStoreForTests(): Promise<void> {
  await secretsDb.delete()
  await secretsDb.open()
}
