#!/usr/bin/env bash
#
# Run the app locally in development.
#
# Usage:
#   scripts/run.sh              start the dev server
#   scripts/run.sh --port 3000  use a different port
#
# The server listens on all interfaces by default (see `server.host` in
# vite.config.ts): `localhost` otherwise resolves to IPv6 only, and a browser
# trying IPv4 first gets connection refused while `curl` works fine. That is a
# failure worth fixing in configuration rather than diagnosing per machine, but
# it does mean the dev server is reachable from the local network.
#
# Any unrecognised arguments are passed through to vite.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Node 24 is the version the toolchain is pinned to: .nvmrc, the package.json
# engines field and CI all agree on it, and the pinned dependency versions
# (vitest 5, jsdom 30) refuse to run on anything older. Checking here is far
# cheaper than reading a vitest engine error and working backwards from it.
REQUIRED_MAJOR=22
REQUIRED_MINOR=12

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is not on PATH." >&2
  echo "       install Node ${REQUIRED_MAJOR}.${REQUIRED_MINOR} or newer, or run 'nvm use'." >&2
  exit 1
fi

node_version="$(node --version)"            # e.g. v24.15.0
node_major="${node_version#v}"; node_major="${node_major%%.*}"
node_rest="${node_version#v}"; node_rest="${node_rest#*.}"
node_minor="${node_rest%%.*}"

version_ok=1
if [ "$node_major" -lt "$REQUIRED_MAJOR" ]; then
  version_ok=0
elif [ "$node_major" -eq "$REQUIRED_MAJOR" ] && [ "$node_minor" -lt "$REQUIRED_MINOR" ]; then
  version_ok=0
fi

if [ "$version_ok" -eq 0 ]; then
  echo "error: node ${node_version} is too old; this project needs >= ${REQUIRED_MAJOR}.${REQUIRED_MINOR}." >&2
  echo "       'nvm use' reads .nvmrc and will switch to the right version." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies from the lockfile..."
  npm ci
fi

PORT_ARGS=()
if [ "${1:-}" = "--port" ]; then
  shift
  PORT_ARGS=(--port "${1:-5173}")
  shift
fi

# Printed rather than assumed: the app lives under a base path, so the bare
# origin is a redirect and typing it in by habit lands somewhere unexpected.
BASE_PATH="/career-management/"
LOCAL_URL="http://localhost:${1:-5173}"

cat <<EOF

  Career Management Document — development

  Open this in a browser:

      ${LOCAL_URL}${BASE_PATH}

  Not http://localhost:${1:-5173}/ — that is a redirect, not the app.

  Base path: ${BASE_PATH}
  Dropbox:   development app (selected by host, not by build)

  The dev server listens on all interfaces, so it is reachable from the local
  network. It holds no data until you enter any, and it is a development server
  only — but it is not firewalled.

  Note on Dropbox: Dropbox requires the redirect URI to match one registered in
  the App Console exactly. Add "http://localhost:${1:-5173}" to the redirect
  URIs of the *development* app (App key pfmrgy11xyykfqa) at
  https://www.dropbox.com/developers/apps, or the consent screen returns
  "invalid_redirect_uri" and names nothing useful.

  Ctrl-C to stop.

EOF

exec npx vite "${PORT_ARGS[@]}" "$@"
