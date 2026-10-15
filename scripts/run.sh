#!/usr/bin/env bash
#
# Run the app locally in development.
#
# Usage:
#   scripts/run.sh              start the dev server
#   scripts/run.sh --host       listen on all interfaces, not just localhost
#   scripts/run.sh --port 3000  use a different port
#
# Any other arguments are passed through to vite.

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

# The dev server's default host is localhost, which is what the Dropbox consent
# screen needs to be able to return to. The deployed origin is the one registered
# in the Dropbox App Console; see the note below.
HOST_ARGS=()
DISPLAY_URL="http://localhost:5173/"

if [ "${1:-}" = "--host" ]; then
  shift
  HOST_ARGS=(--host 0.0.0.0)
  DISPLAY_URL="http://localhost:5173/ (also on your network)"
fi

PORT_ARGS=()
if [ "${1:-}" = "--port" ]; then
  shift
  PORT_ARGS=(--port "${1:-5173}")
  DISPLAY_URL="http://localhost:${1:-5173}/"
fi

cat <<EOF

  Career Management Document — development

  Serving:   ${DISPLAY_URL}
  Base path: /career-management/
  Dropbox:   development app (selected by host, not by build)

  Note on Dropbox: the app is served from ${DISPLAY_URL} in development, and
  Dropbox requires the redirect URI to match one registered in the App Console
  exactly. Add "${DISPLAY_URL%/}" to the redirect URIs of the *development* app
  (App key pfmrgy11xyykfqa) at https://www.dropbox.com/developers/apps, or the
  consent screen will return "invalid_redirect_uri" and name nothing useful.

  Ctrl-C to stop.

EOF

exec npx vite "${HOST_ARGS[@]}" "${PORT_ARGS[@]}" "$@"
