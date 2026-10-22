/**
 * The assistant's provider.
 *
 * The properties that matter are about what leaves the device: what goes in the
 * request, what does not, and where the key goes. A provider that put the key
 * in the URL, or sent the document, would be a leak that no test of the
 * response would catch.
 */

import { describe, expect, it } from 'vitest'
import { chatCompletionsProvider, MODEL, ORIGIN } from './chatCompletions'

const REQUEST = { instruction: 'Make it about cost', draft: 'Shipped the thing' }

/** The request body, as the text it is. */
function bodyOf(init: RequestInit): string {
  return typeof init.body === 'string' ? init.body : ''
}

describe('the provider', () => {
  it('reaches one fixed origin, and nothing the user wrote is in the URL', () => {
    const { url } = chatCompletionsProvider.buildRequest('a-key', {
      instruction: 'a secret instruction https://elsewhere.example',
      draft: 'another secret',
    })
    expect(url).toBe(`${ORIGIN}/v1/chat/completions`)
    expect(url).not.toContain('secret')
    expect(url).not.toContain('elsewhere')
  })

  it('sends the key in a header, and never in the body', () => {
    const { init } = chatCompletionsProvider.buildRequest('the-key', REQUEST)
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer the-key')
    expect(bodyOf(init)).not.toContain('the-key')
  })

  it('sends the instruction and the draft, and nothing else', () => {
    const { init } = chatCompletionsProvider.buildRequest('the-key', REQUEST)
    const body = JSON.parse(bodyOf(init)) as {
      model: string
      messages: { role: string; content: string }[]
    }
    expect(body.model).toBe(MODEL)
    expect(body.messages.map((message) => message.role)).toEqual(['system', 'user'])
    // The instruction and the draft, and the instruction that says what a line
    // on a CV is. Nothing about the profile, the jobs or the other achievements,
    // because nothing about them is sent.
    expect(body.messages[1]?.content).toContain('Make it about cost')
    expect(body.messages[1]?.content).toContain('Shipped the thing')
    expect(JSON.stringify(body)).not.toContain('jobId')
    expect(JSON.stringify(body)).not.toContain('profile')
  })

  it('sends the instruction alone when there is nothing written yet', () => {
    const { init } = chatCompletionsProvider.buildRequest('the-key', {
      instruction: 'Make it about cost',
      draft: '',
    })
    const body = JSON.parse(bodyOf(init)) as { messages: { content: string }[] }
    expect(body.messages[1]?.content).toBe('Make it about cost')
  })

  it('says what it is, for the disclosure', () => {
    expect(chatCompletionsProvider.disclosure).toContain('instruction')
    expect(chatCompletionsProvider.disclosure).toContain('key')
  })
})

describe('reading the answer', () => {
  it('reads the text out of a response', () => {
    const text = chatCompletionsProvider.readResponse({
      choices: [{ message: { content: '  Cut the billing page load time in half.  ' } }],
    })
    expect(text).toBe('Cut the billing page load time in half.')
  })

  it('says nothing rather than throwing when the response is not what it expected', () => {
    // A provider that changes its shape, an error page, a rate limit: none of
    // them should take the form down.
    expect(chatCompletionsProvider.readResponse(null)).toBe('')
    expect(chatCompletionsProvider.readResponse('a string')).toBe('')
    expect(chatCompletionsProvider.readResponse({})).toBe('')
    expect(chatCompletionsProvider.readResponse({ choices: [] })).toBe('')
    expect(chatCompletionsProvider.readResponse({ choices: [{}] })).toBe('')
    expect(chatCompletionsProvider.readResponse({ choices: [{ message: {} }] })).toBe('')
    expect(
      chatCompletionsProvider.readResponse({ choices: [{ message: { content: 7 } }] }),
    ).toBe('')
  })
})
