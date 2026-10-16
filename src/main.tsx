import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles.css'
import { beginAuthCallback } from './sync/oauthCallback'

/*
 * Start the OAuth redirect handler before rendering.
 *
 * Started, not awaited: the exchange is a network round trip and nothing in the
 * app needs it to draw. The result is memoised, so the sync panel awaits the same
 * promise rather than starting a second exchange — which matters, because a
 * second one would try to redeem the same single-use code and fail.
 */
void beginAuthCallback()

const container = document.getElementById('root')
if (!container) {
  throw new Error('index.html is missing its #root element')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
