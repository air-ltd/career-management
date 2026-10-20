/**
 * The provider that speaks the chat-completions API.
 *
 * One origin, one wire format, and the key the user brought with them. The
 * format is the one most providers have copied, so the module is small and the
 * abstraction above it is what would change if a second provider arrived.
 *
 * The model is a constant and a provisional one: the spec records the model as
 * undecided, and a user who wants a different one should be able to choose it
 * rather than have it chosen for them.
 */

import type { AiProvider, AiRequest } from './provider'

/** Where the request goes. The content security policy allows this origin. */
export const ORIGIN = 'https://api.openai.com'

/** The path, relative to the origin. */
const PATH = '/v1/chat/completions'

/**
 * The model.
 *
 * Provisional. A user with a key for a different provider, or a different model,
 * should be able to change it, and this is the one place to do it.
 */
export const MODEL = 'gpt-4o-mini'

/**
 * The instruction the model is given.
 *
 * It is told what a career document is and what it is not, because a general
 * assistant will otherwise answer the question and leave the answer shaped like
 * an essay rather than like a line on a CV.
 */
const SYSTEM_PROMPT = [
  'You help a person write one line for a CV or a job application.',
  'Answer with the line only: no preamble, no explanation, no quotation marks,',
  'no bullet character, and no heading.',
  'Write in the past tense, start with a verb, and put a measurable result first',
  'where there is one. Keep it to one or two sentences.',
  'If the request does not contain enough to work from, write the most useful',
  'line you can and say nothing else.',
].join(' ')

export const chatCompletionsProvider: AiProvider = {
  id: 'chat-completions',
  label: 'Chat completions',
  origin: ORIGIN,
  disclosure:
    'Your instruction and the text you are writing are sent to the provider, with your own key. Nothing else in the document is sent.',

  buildRequest(key: string, request: AiRequest) {
    return {
      url: `${ORIGIN}${PATH}`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The key the user brought. It is read here and nowhere else, and it
          // never goes near the document.
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content:
                request.draft === ''
                  ? request.instruction
                  : `${request.instruction}\n\nThe line so far:\n${request.draft}`,
            },
          ],
        }),
      },
    }
  },

  readResponse(payload: unknown): string {
    if (typeof payload !== 'object' || payload === null) return ''
    const choices = (payload as { choices?: unknown }).choices
    if (!Array.isArray(choices) || choices.length === 0) return ''
    const message = (choices[0] as { message?: { content?: unknown } }).message
    const content = message?.content
    return typeof content === 'string' ? content.trim() : ''
  },
}
