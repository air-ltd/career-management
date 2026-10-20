/**
 * Asking the provider for a draft.
 *
 * The hook, and the rules about what is sent.
 *
 * What leaves the device is the user's instruction and the text they are
 * writing, and nothing else. Not the document, not the profile, not the other
 * achievements — a user who wants a line drafted does not expect their CV to be
 * posted somewhere, and the app has no reason to send it.
 *
 * Nothing is sent at all until the user asks for a draft, and the button is
 * only offered when there is a key to send it with.
 */

import { useCallback, useState } from 'react'
import { readProviderKey } from './key'
import type { AiProvider } from './provider'

export interface DraftState {
  /** What the user asked for. */
  instruction: string
  setInstruction: (next: string) => void
  /** The draft that came back, if one has. */
  draft: string
  /** Whether a request is in flight. */
  working: boolean
  /** The reason the last request failed, if it did. */
  error: string | null
  /** Whether a key is set for this provider. */
  hasKey: boolean
  /** Re-read the key, for when one has just been set or cleared. */
  refresh: () => void
  /** Ask for a draft. */
  run: (current: string) => Promise<void>
  /** Throw the draft away. */
  clear: () => void
}

export function useDraft(provider: AiProvider): DraftState {
  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Read once, at mount: the key can only be set on the settings page, and
  // setting it means leaving this one, so the page comes back afresh.
  const [hasKey, setHasKey] = useState(() => readProviderKey(provider.id) !== '')

  const refresh = useCallback(() => {
    setHasKey(readProviderKey(provider.id) !== '')
  }, [provider.id])

  const run = useCallback(
    async (current: string) => {
      const key = readProviderKey(provider.id)
      if (key === '') {
        setError('There is no key for this provider. Add one in Settings.')
        return
      }
      setWorking(true)
      setError(null)
      try {
        const { url, init } = provider.buildRequest(key, { instruction, draft: current })
        const response = await fetch(url, init)
        if (!response.ok) {
          setError(`The provider said ${String(response.status)}.`)
          return
        }
        const payload: unknown = await response.json()
        const text = provider.readResponse(payload)
        if (text === '') {
          setError('The provider sent nothing back.')
          return
        }
        setDraft(text)
      } catch {
        // The network, or the provider, or the key. Which one is not knowable
        // here, and saying so would not help anybody.
        setError('The request could not be completed. Check the key and the connection.')
      } finally {
        setWorking(false)
      }
    },
    [provider, instruction],
  )

  return {
    instruction,
    setInstruction,
    draft,
    working,
    error,
    hasKey,
    refresh,
    run,
    clear: () => {
      setDraft('')
      setError(null)
    },
  }
}
