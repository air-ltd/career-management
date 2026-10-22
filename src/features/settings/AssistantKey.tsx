/**
 * The assistant's key, in the settings.
 *
 * Its own panel, and its own save, because it is not a document setting: it is
 * a credential, and it must never be written into the document, which syncs to
 * Dropbox and is exported to employers. It is kept in this browser and nowhere
 * else, so it is saved here and not with the document.
 *
 * A component of its own so that the settings page holds nothing to do with
 * the assistant when the assistant is not in the release — including the read
 * of the key, which is a credential the app has no reason to touch.
 */

import { useEffect, useState } from 'react'
import { clearProviderKey, readProviderKey, writeProviderKey } from '../../ai/key'
import { chatCompletionsProvider } from '../../ai/chatCompletions'

export function AssistantKey() {
  // The key is read from the secrets store, never from the document.
  const [providerKey, setProviderKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const storedKey = await readProviderKey(chatCompletionsProvider.id)
      if (!cancelled) setProviderKey(storedKey)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="panel">
      <h3>Assistant</h3>
      <p className="hint">
        Drafting a line with an assistant uses a provider of your own. Your key is kept in this
        browser only: it is never synced, never exported and never sent anywhere but the
        provider. The document itself is never sent — only the instruction and the line you are
        writing.
      </p>
      <div className="field">
        <label htmlFor="provider-key">Your provider key</label>
        <input
          id="provider-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={providerKey}
          onChange={(event) => {
            setProviderKey(event.target.value)
            setKeySaved(false)
          }}
        />
        <p className="field-hint">
          {providerKey === ''
            ? 'No key is set, so the drafting panel is not offered.'
            : `Kept in this browser. The provider is ${chatCompletionsProvider.label}, at ${chatCompletionsProvider.origin}.`}
        </p>
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => {
            void writeProviderKey(chatCompletionsProvider.id, providerKey.trim()).then(() => {
              setKeySaved(true)
            })
          }}
        >
          Save key
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            void clearProviderKey(chatCompletionsProvider.id).then(() => {
              setProviderKey('')
              setKeySaved(true)
            })
          }}
        >
          Forget key
        </button>
        {keySaved && <span className="hint">Saved.</span>}
      </div>
    </div>
  )
}
