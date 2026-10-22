/**
 * The provider key, and where it is kept.
 *
 * A credential's behaviour is worth testing on its own terms: it must be
 * readable by the provider that owns it, invisible to the others, and gone when
 * it is forgotten.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearProviderKey, readProviderKey, writeProviderKey } from './key'
import { clearSecretsForTests } from '../storage/secretsRepo'

beforeEach(async () => {
  await clearSecretsForTests()
})

afterEach(async () => {
  await clearSecretsForTests()
})

describe('the provider key', () => {
  it('is readable by the provider that owns it', async () => {
    await writeProviderKey('chat-completions', 'the-key')
    expect(await readProviderKey('chat-completions')).toBe('the-key')
  })

  it('is not readable by another provider', async () => {
    await writeProviderKey('chat-completions', 'the-key')
    expect(await readProviderKey('something-else')).toBe('')
  })

  it('is gone when it is forgotten', async () => {
    await writeProviderKey('chat-completions', 'the-key')
    await clearProviderKey('chat-completions')
    expect(await readProviderKey('chat-completions')).toBe('')
  })

  it('is gone when it is written empty, rather than stored empty', async () => {
    await writeProviderKey('chat-completions', 'the-key')
    await writeProviderKey('chat-completions', '')
    expect(await readProviderKey('chat-completions')).toBe('')
  })

  it('replaces a key rather than keeping both', async () => {
    await writeProviderKey('chat-completions', 'first')
    await writeProviderKey('chat-completions', 'second')
    expect(await readProviderKey('chat-completions')).toBe('second')
  })

  it('is not in the document, which is the property that matters', async () => {
    /*
     * The document syncs to Dropbox and is exported; the key is in neither. The
     * secrets store is a separate database, and this is the test that says so.
     */
    await writeProviderKey('chat-completions', 'the-key')
    const { db } = await import('../storage/db')
    const tables = [...db.tables].map((table) => table.name)
    for (const name of tables) {
      const rows = await db.table(name).toArray()
      expect(JSON.stringify(rows)).not.toContain('the-key')
    }
  })

  it('reads as no key when the store holds something that is not one', async () => {
    const { secrets } = await import('../storage/secretsRepo')
    await secrets.write('provider:chat-completions', { notTheKey: 'x' })
    expect(await readProviderKey('chat-completions')).toBe('')
    await secrets.write('provider:chat-completions', 'a bare string')
    expect(await readProviderKey('chat-completions')).toBe('')
  })
})
