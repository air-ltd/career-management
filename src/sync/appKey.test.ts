/**
 * Which Dropbox app this origin talks to.
 *
 * The rule under test is a safety property, not a convenience: anything not
 * exactly the production host must resolve to development, so a build served
 * from an unexpected address can never reach the real document (SY32).
 */

import { describe, expect, it, vi } from 'vitest'
import {
  BUILT_IN_KEYS,
  describeKeySource,
  environmentForHost,
  isValidAppKey,
  readAppKey,
} from './appKey'

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

describe('which key is in play', () => {
  it('is the development key away from the production host', () => {
    // jsdom serves the test at localhost, which is development by the rule
    // above — anything not exactly the production host is.
    expect(readAppKey()).toBe(BUILT_IN_KEYS.development)
  })

  it('is the environment variable when there is one, because that is the point of it', () => {
    vi.stubEnv('VITE_DROPBOX_APP_KEY_DEVELOPMENT', 'anoverridingkey')
    expect(readAppKey()).toBe('anoverridingkey')
    expect(describeKeySource().source).toBe('environment')
    vi.unstubAllEnvs()
  })

  it('says where the key came from, so the header can show it', () => {
    const source = describeKeySource()
    expect(source.source).toBe('builtin')
    expect(source.environment).toBe('development')
    expect(source.key).toBe(BUILT_IN_KEYS.development)
  })

  it('ignores a key saved in the browser, which used to override the host', () => {
    // A key in the browser paired with whichever redirect URI that other app had
    // registered, and Dropbox rejected it with a message that named nothing
    // useful. The host decides, and only the host.
    window.localStorage.setItem('cmd:dropbox-app-key', 'someothersappkey')
    expect(readAppKey()).toBe(BUILT_IN_KEYS.development)
    window.localStorage.removeItem('cmd:dropbox-app-key')
  })
})
