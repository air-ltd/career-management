/**
 * The AI provider, as an abstraction.
 *
 * Not a vendor: the same reason the sync layer names Dropbox rather than an API
 * shape, so a second provider is a new module and not a change to the app.
 *
 * A provider is a fixed origin, because the content security policy is fixed at
 * build time and names the origins the app may talk to. A provider the user
 * could point anywhere would need a policy that allows anywhere, which is the
 * one thing the policy exists to prevent.
 *
 * The spec's own warning applies to all of this: the user can already select a
 * paragraph, paste it into an assistant and paste the answer back, and any
 * integration has to beat that on convenience rather than on capability. What it
 * adds is the house style and the length, which a blank assistant has no way of
 * knowing.
 */

export interface AiRequest {
  /** What the user asked for, in their own words. */
  instruction: string
  /** The text being written, if there is any. */
  draft: string
}

export interface AiProvider {
  readonly id: string
  readonly label: string
  /** The origin the provider is reached at. The policy has to allow it. */
  readonly origin: string
  /**
   * What the provider is and what it will be told, for the disclosure.
   *
   * The user is about to send their words to another company, and the app's job
   * is to say so plainly rather than to leave it in a privacy policy.
   */
  readonly disclosure: string
  /** The request to make, given a key and a prompt. */
  buildRequest(key: string, request: AiRequest): { url: string; init: RequestInit }
  /** The text out of a response. */
  readResponse(payload: unknown): string
}
