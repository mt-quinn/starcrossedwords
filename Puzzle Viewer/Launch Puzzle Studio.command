#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_PATH="$SCRIPT_DIR/puzzle-studio.log"
PORT="4312"

if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  cd "$REPO_ROOT"
  npm run puzzle:studio >> "$LOG_PATH" 2>&1 &
  disown
  sleep 2
fi

open "http://127.0.0.1:$PORT/studio.html"
