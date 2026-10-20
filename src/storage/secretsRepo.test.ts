/**
 * The secrets store.
 *
 * One store for every credential the app holds, each under its own name. The
 * properties that matter: the Dropbox token and the assistant's key must not
 * read each other, and neither must be readable from the document.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSecretsForTests, secrets, tokenStore } from './secretsRepo'
import { db } from './db'

beforeEach(async () => {
  await clearSecretsForTests()
})

afterEach(async () => {
  await clearSecretsForTests()
})

describe('the store', () => {
  it('holds a secret under its name', async () => {
    await secrets.write('one', { value: 1 })
    expect(await secrets.read('one')).toEqual({ value: 1 })
  })

  it('does not give one secret to another name', async () => {
    await secrets.write('one', { value: 1 })
    expect(await secrets.read('two')).toBeUndefined()
  })

  it('forgets one', async () => {
    await secrets.write('one', { value: 1 })
    await secrets.clear('one')
    expect(await secrets.read('one')).toBeUndefined()
  })
})

describe('the token store', () => {
  it('holds the Dropbox token under its own name', async () => {
    await tokenStore.write({ accessToken: 'a-token' })
    expect(await tokenStore.read()).toEqual({ accessToken: 'a-token' })
  })

  it('does not collide with the key of the assistant', async () => {
    await tokenStore.write({ accessToken: 'a-token' })
    await secrets.write('provider:chat-completions', { key: 'the-key' })
    expect(await secrets.read('provider:chat-completions')).toEqual({ key: 'the-key' })
    expect(await tokenStore.read()).toEqual({ accessToken: 'a-token' })
  })

  it('forgets the token', async () => {
    await tokenStore.write({ accessToken: 'a-token' })
    await tokenStore.clear()
    expect(await tokenStore.read()).toBeUndefined()
  })

  it('is in a database of its own, and not in the document', async () => {
    await tokenStore.write({ accessToken: 'a-token' })
    const tables = [...db.tables].map((table) => table.name)
    for (const name of tables) {
      const rows = await db.table(name).toArray()
      expect(JSON.stringify(rows)).not.toContain('a-token')
    }
  })
})
