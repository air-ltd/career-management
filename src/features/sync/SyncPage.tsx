/**
 * The sync page: status, the manual trigger, and the activity log.
 */

import { useSync } from './syncContext'
import { currentRedirectUri, deployedRedirectUri } from '../../sync/redirect'
import { describeKeySource, isValidAppKey } from '../../sync/appKey'

export function SyncPage() {
  const { status, connected, environment, syncNow, signOut, connect, log } = useSync()

  // The effective key, whether built in or supplied at build time — not just the
  // environment variable, which is absent for the common case.
  const { key } = describeKeySource()
  const keyShapeValid = isValidAppKey(key)

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
          {connected ? (
            <span className="badge badge-ok">connected</span>
          ) : (
            <span className="badge">not connected</span>
          )}
          {status.pending && !connected === false && (
            <span className="badge badge-warn">changes waiting</span>
          )}
        </p>

        {status.lastSyncAt !== null && (
          <p className="hint">Last successful sync: {formatMoment(status.lastSyncAt)}</p>
        )}

        {status.message !== null && (
          <p className="form-error" role="alert">
            {status.message}
          </p>
        )}

        <div className="button-row">
          {connected ? (
            <>
              <button type="button" className="button button-primary" onClick={syncNow}>
                Sync now
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  void signOut()
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                void connect()
              }}
            >
              Connect to Dropbox
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>This build</h3>
        <dl className="detail-list">
          <dt>Environment</dt>
          <dd>{environment}</dd>
          <dt>Redirect URI</dt>
          <dd>
            <code>{currentRedirectUri()}</code>
          </dd>
          <dt>Registered</dt>
          <dd>
            <code>{deployedRedirectUri()}</code>
          </dd>
          {!keyShapeValid && (
            <>
              <dt>App key</dt>
              <dd>No key set for this environment in the build.</dd>
            </>
          )}
        </dl>
        <p className="hint">
          The environment is chosen by the host this page is served from, not by how it was
          built, so a development build cannot reach the production document.
        </p>
      </div>

      {log.length > 0 && (
        <div className="panel">
          <h3>Recent activity</h3>
          <ul className="log-list">
            {log.map((entry) => (
              <li key={`${entry.at}-${entry.message}`} className={`log-${entry.level}`}>
                <time dateTime={entry.at}>{formatTime(entry.at)}</time>
                <span>{entry.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function formatMoment(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString()
}

function formatTime(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleTimeString()
}
