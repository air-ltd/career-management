/**
 * Drafting a line with an assistant.
 *
 * The panel in the form being written. It is a disclosure, and it is only
 * offered when there is a key: a button that cannot do anything is worse than
 * no button, and a key that is not set means the feature is not in use.
 *
 * What it sends, and what it does not, is said on the panel rather than in a
 * privacy policy: the user is about to send their own words to another company,
 * and the app's job is to say so at the moment they do it.
 */

import { useState } from 'react'
import { useDraft } from '../../ai/useDraft'
import { chatCompletionsProvider } from '../../ai/chatCompletions'
import type { AiProvider } from '../../ai/provider'

export function DraftPanel({
  current,
  onUse,
}: {
  /** What is in that field now. */
  current: string
  /** Called with the draft, to put it in the field. */
  onUse: (text: string) => void
}) {
  const [provider] = useState<AiProvider>(chatCompletionsProvider)
  const state = useDraft(provider)
  const [open, setOpen] = useState(false)

  if (!state.hasKey) return null

  return (
    <details
      className="record-assist"
      open={open}
      onToggle={(event) => {
        setOpen((event.target as HTMLDetailsElement).open)
        state.refresh()
      }}
    >
      <summary>Draft with an assistant</summary>

      <p className="record-assist-note">{provider.disclosure}</p>

      <label className="field" htmlFor="ai-instruction">
        <span>What should it say?</span>
        <textarea
          id="ai-instruction"
          name="ai-instruction"
          rows={2}
          value={state.instruction}
          onChange={(event) => {
            state.setInstruction(event.target.value)
          }}
        />
      </label>

      <div className="button-row">
        <button
          type="button"
          className="button button-small"
          disabled={state.working || state.instruction.trim() === ''}
          onClick={() => {
            void state.run(current)
          }}
        >
          {state.working ? 'Asking…' : 'Draft it'}
        </button>
      </div>

      {state.error !== null && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      {state.draft !== '' && (
        <>
          <label className="field" htmlFor="ai-draft">
            <span>The draft</span>
            <textarea id="ai-draft" name="ai-draft" rows={3} readOnly value={state.draft} />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                onUse(state.draft)
                state.clear()
              }}
            >
              Use this
            </button>
            <button type="button" className="button button-small" onClick={state.clear}>
              Discard
            </button>
          </div>
        </>
      )}
    </details>
  )
}
