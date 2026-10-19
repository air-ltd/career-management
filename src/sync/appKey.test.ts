/**
 * Which Dropbox app this origin talks to.
 *
 * The rule under test is a safety property, not a convenience: anything not
 * exactly the production host must resolve to development, so a build served
 * from an unexpected address can never reach the real document (SY32).
 */

import { describe, expect, it } from 'vitest'
import { BUILT_IN_KEYS, environmentForHost, isValidAppKey } from './appKey'

describe('environmentForHost', () => {
  it('treats the deployed host as production', () => {
    expect(environmentForHost('air-ltd.github.io')).toBe('production')
  })

  it.each([
    'localhost',
    '127.0.0.1',
    '[::1]',
    'career-management.local',
    'air-ltd.github.io.evil.example',
    'AIR-LTD.GITHUB.IO',
    'someone-else.github.io',
    '',
  ])('treats %j as development', (host) => {
    // The last two are the interesting ones: a suffix that starts with the
    // production host, and a different case. Neither may match.
    expect(environmentForHost(host)).toBe('development')
  })
})

describe('isValidAppKey', () => {
  it('accepts the shape Dropbox issues', () => {
    expect(isValidAppKey('pfmrgy11xyykfqa')).toBe(true)
    expect(isValidAppKey('j940zdg4vb622zt')).toBe(true)
  })

  it('rejects anything that is not 8–64 alphanumerics', () => {
    expect(isValidAppKey('')).toBe(false)
    expect(isValidAppKey('short')).toBe(false)
    expect(isValidAppKey('has spaces here')).toBe(false)
    expect(isValidAppKey('has-dashes-here')).toBe(false)
  })

  it('ignores surrounding whitespace', () => {
    expect(isValidAppKey('  pfmrgy11xyykfqa  ')).toBe(true)
  })
})

describe('built-in keys', () => {
  it('has a distinct key per environment', () => {
    // If these were the same, a development build would write to the production
    // document and nothing would look wrong.
    expect(BUILT_IN_KEYS.production).not.toBe(BUILT_IN_KEYS.development)
  })

  it('only contains the two environments, both with real keys', () => {
    expect(Object.keys(BUILT_IN_KEYS).sort()).toEqual(['development', 'production'])
    for (const key of Object.values(BUILT_IN_KEYS)) {
      expect(isValidAppKey(key)).toBe(true)
    }
  })
})
