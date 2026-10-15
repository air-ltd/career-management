/**
 * The sync page.
 *
 * Phase 3 wires this to the engine. What exists now is the connect/disconnect
 * surface and the environment badge, so the OAuth flow can be exercised against
 * the development app before the scheduler is written.
 */

import { useEffect, useState } from 'react'
import { DropboxProvider } from '../../sync/dropbox/DropboxProvider'
import { describeKeySource, readAppKey } from '../../sync/appKey'
import { currentRedirectUri, deployedRedirectUri } from '../../sync/redirect'
import { tokenStore } from '../../storage/secretsRepo'
import { takeAuthError } from '../../sync/oauthCallback'
import { SyncError } from '../../sync/provider'

export function SyncPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(takeAuthError())

  const { environment, source } = describeKeySource()
  const key = readAppKey()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const status = await new DropboxProvider({
        clientId: key,
        redirectUri: currentRedirectUri(),
        storage: tokenStore,
      }).status()
      if (!cancelled) setConnected(status.authenticated)
    })()
    return () => {
      cancelled = true
    }
  }, [key])

  async function connect() {
    setBusy(true)
    setMessage(null)
    try {
      const provider = new DropboxProvider({
        clientId: key,
        redirectUri: currentRedirectUri(),
        storage: tokenStore,
      })
      const state = crypto.randomUUID()
      const { url } = await provider.beginAuth(state)
      window.location.assign(url)
    } catch (error) {
      setMessage(error instanceof SyncError ? error.message : 'Could not start the sign-in.')
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    await new DropboxProvider({
      clientId: key,
      redirectUri: currentRedirectUri(),
      storage: tokenStore,
    }).signOut()
    setConnected(false)
    setBusy(false)
  }

  return (
    <section className="sync-page">
      <h2>Sync</h2>

      <div className="panel">
        <h3>Dropbox</h3>
        <p className="hint">
          The document lives in this browser and is copied to your own Dropbox app folder.
          Nothing is sent anywhere else, and everything keeps working with the network off.
        </p>

        <p>
          Status:{' '}
          {connected === null ? (
            <span className="hint">checking…</span>
          ) : connected ? (
            <span className="badge badge-ok">connected</span>
          ) : (
            <span className="badge">not connected</span>
          )}
        </p>

        <p className="hint">
          Environment <strong>{environment}</strong> ({source} key). Redirect URI:{' '}
          <code>{currentRedirectUri()}</code>
        </p>
        <p className="hint">
          Registered redirect URI: <code>{deployedRedirectUri()}</code>
        </p>

        <div className="button-row">
          {connected ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => void connect()}
            >
              Connect to Dropbox
            </button>
          )}
        </div>

        {message !== null && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
      </div>

      <div className="panel">
        <h3>What is not here yet</h3>
        <p className="hint">
          The connect flow works; the automatic sync cycle does not. That is Phase 3 — the
          engine and scheduler are written, but nothing calls them yet, so connecting will not
          yet move data. The document is fully usable without it.
        </p>
      </div>
    </section>
  )
}
